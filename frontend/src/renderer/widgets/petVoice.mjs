// 桌面宠物的语音/对话能力(接入小智 ESP32 服务端)
//
// M2 阶段:文字对话。提供宠物气泡旁的输入框,用户打字 → 小智 detect 模式 →
//         回复文字显示在气泡 + 情绪驱动宠物动画。
// M5 阶段:麦克风按钮接入真实语音(见 petVoiceCapture.mjs)。
//
// 设计:
//  - 不新建气泡 DOM,复用 pet.js 的 showBubble(经 pet-voice-reply 事件)。
//  - 输入框/麦克风按钮放在 #widget-pet 内,符合点击穿透命中逻辑(drag.js isOverWidget)。
//  - 所有特权能力经 window.alwaysHere 暴露的 IPC,沿用 contextIsolation 安全模型。

import { normalizeVoiceSettings } from './voiceSettings.mjs'
import { emotionToAnimation, emotionToEmote, VOICE_PHASE_ANIMATION } from './voiceEmotion.mjs'

let getConfigFn = null
let saveConfigFn = null
let inputEl = null
let micBtn = null
let listening = false // 是否正在语音输入(M5)
let speaking = false // 小智是否正在说话
let abortBtn = null // 说话时的"打断"按钮(复用气泡 action 区)
let lastSpokenText = '' // 最近一句 TTS 文本,用于说完后补发气泡收尾
let bubbleDismissTimer = null // TTS 说完后延迟收尾气泡的计时器

// 记录本端主动发给小智的"引导 prompt"(非真实用户发言)。
// 小智 detect 模式会把注入文本当成用户语音回显 stt,这些内部指令不应出现在气泡里。
const systemPrompts = new Set()
// 服务端回显 stt 前会剥掉文本首尾的空白、标点(半角/全角)和 emoji:
//   xiaozhi-server/.../textUtils.py:get_string_no_punctuation_or_emoji
//   (经 send_stt_message 应用到每条回显的 stt)。
// 注入小智的"内部 prompt"(看屏幕、主动搭话等)会走 detect 模式被原样回显为 stt。
// 若登记/匹配时不镜像这个首尾剥离,结尾的 `。` 之类会让精确匹配失败,
// 导致发给 AI 的指令被当作用户发言泄漏进气泡(显示成"🧑 你刚看到用户的屏幕:...")。
const STT_EDGE_TRIM = /^[\s\u3000,，.。!！?？:：;；“”"‘’'()（）【】\[\]、\-－～]+|[\s\u3000,，.。!！?？:：;；“”"‘’'()（）【】\[\]、\-－～]+$/g
function normalizePrompt(text) {
  return (text || '').replace(STT_EDGE_TRIM, '').toLowerCase()
}
function markSystemPrompt(text) {
  const key = normalizePrompt(text)
  if (key) systemPrompts.add(key)
}
function isSystemPrompt(text) {
  return systemPrompts.has(normalizePrompt(text))
}
function consumeSystemPrompt(text) {
  // 匹配一次即移除,避免误吞后续相同的真实用户输入
  const key = normalizePrompt(text)
  return systemPrompts.delete(key)
}

// ── 音频播放(M4:小智 TTS 下行音频) ──
let audioCtx = null
let nextPlayTime = 0 // 下一个块该播放的时间(保证连续)
let speakingAnimTimer = null

function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  // 浏览器策略要求用户交互后才能 resume
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

// 播放一块 Float32 PCM(24kHz 单声道)
function playPcmChunk(samples, sampleRate) {
  if (!samples || samples.length === 0) return
  const ctx = ensureAudioCtx()
  const buffer = ctx.createBuffer(1, samples.length, sampleRate)
  buffer.getChannelData(0).set(samples)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)

  const now = ctx.currentTime
  // 如果上次播放已结束或还没开始,从当前时刻播;否则排队接续
  if (nextPlayTime < now) nextPlayTime = now
  source.start(nextPlayTime)
  nextPlayTime += buffer.duration

  // 说话中持续播放动画(避免动画停在某一帧)
  keepSpeakingAnimation()
}

function keepSpeakingAnimation() {
  if (speakingAnimTimer) clearTimeout(speakingAnimTimer)
  // 每次有音频块就续命;800ms 无新块则认为说完
  speakingAnimTimer = setTimeout(() => {
    if (speaking) {
      speaking = false
      setPetAnimation(VOICE_PHASE_ANIMATION.idle)
    }
  }, 800)
}

function resetAudioPlayback() {
  nextPlayTime = 0
  if (speakingAnimTimer) {
    clearTimeout(speakingAnimTimer)
    speakingAnimTimer = null
  }
}

// TTS stop 到达后,尾音可能还在播。等约 1.2s(略长于音频收尾的 800ms)
// 再补发一次"非 persistent"气泡,让 showBubble 按 bubbleDurationMs 自动隐藏。
// 这样回复没读完时气泡一直常驻,读完后才按设定时长消失。
function scheduleBubbleDismissal() {
  if (bubbleDismissTimer) clearTimeout(bubbleDismissTimer)
  bubbleDismissTimer = setTimeout(() => {
    bubbleDismissTimer = null
    if (lastSpokenText) {
      // 非 persistent:交给 pet.js 的 showBubble 按时长自动关闭
      showVoiceBubble(`💬 ${lastSpokenText}`)
    }
  }, 1200)
}

function stopAudioPlayback() {
  resetAudioPlayback()
  // AudioContext 重建是最干净的停播方式(打断时立即静音)
  if (audioCtx) {
    try { audioCtx.close() } catch { /* noop */ }
    audioCtx = null
  }
}

// 打断小智说话:发 abort 给服务端 + 立即停止本地音频播放
// 在任何新的用户交互(发消息、点宠物、开始听)时,如果小智正在说话就先打断
async function interruptSpeaking() {
  if (!speaking) return
  speaking = false
  if (bubbleDismissTimer) { clearTimeout(bubbleDismissTimer); bubbleDismissTimer = null }
  stopAudioPlayback()
  try { await window.alwaysHere.voiceAbort() } catch { /* noop */ }
  setPetAnimation(VOICE_PHASE_ANIMATION.idle)
}

function voiceSettings() {
  return normalizeVoiceSettings(getConfigFn().voice)
}

function setPetAnimation(action) {
  if (!action) return
  window.dispatchEvent(new CustomEvent('pet-action', { detail: action }))
}

function showVoiceBubble(text, { confirmable = false, actions = null, persistent = false } = {}) {
  window.dispatchEvent(new CustomEvent('pet-voice-reply', { detail: { text, confirmable, actions, persistent } }))
}

// 处理来自主进程的下行事件
function handleVoiceEvent(event) {
  if (!event) return
  switch (event.type) {
    case 'hello':
      showVoiceBubble('已连接到小智,可以和我聊天啦~')
      break
    case 'system-prompt':
      // 主进程发来本端刚发给小智的"引导 prompt"(看屏幕、主动找话等)。
      // detect 模式会把它当 stt 回显,但这些是发给 AI 的指令,不该当作用户发言显示。
      if (event.text) markSystemPrompt(event.text)
      break
    case 'stt':
      // 显示识别到的用户语音文字(M5)或文字输入回显
      if (event.text) {
        // 工具调用回显(服务端 unified_tool_handler 发的 "% <function_name>",
        // 如 "% get_news_from_newsnow"):不在气泡里显示原始函数名,
        // 改为展示一个"思考中"样式气泡(详见 pet.js 的 'think' 标记处理)
        if (event.text.startsWith('% ')) {
          showVoiceBubble('think')
          setPetAnimation(VOICE_PHASE_ANIMATION.thinking)
          break
        }
        // 跳过本端主动发出的"引导 prompt"(如宠物主动找话),那些是发给 AI 的指令,不是用户发言
        if (!consumeSystemPrompt(event.text)) {
          showVoiceBubble(`🧑 ${event.text}`)
        }
      }
      break
    case 'llm':
      // 情绪驱动宠物动画
      setPetAnimation(emotionToAnimation(event.emotion))
      if (emotionToEmote(event.emotion)) {
        window.dispatchEvent(new CustomEvent('pet-emote', { detail: emotionToEmote(event.emotion) }))
      }
      break
    case 'tts':
      if (event.state === 'start') {
        speaking = true
        resetAudioPlayback()
        // 新一轮回复:取消上一轮可能挂起的收尾计时,避免误关新气泡
        if (bubbleDismissTimer) { clearTimeout(bubbleDismissTimer); bubbleDismissTimer = null }
        setPetAnimation(VOICE_PHASE_ANIMATION.thinking)
      } else if (event.state === 'sentence_start' && event.text) {
        // 逐句更新气泡;用 persistent 让它在"说话中"不被自动关闭计时关掉,
        // 即便两句之间间隔较长,气泡也会一直显示,直到 TTS 真正说完。
        lastSpokenText = event.text
        showVoiceBubble(`💬 ${event.text}`, { persistent: true })
      } else if (event.state === 'stop') {
        speaking = false
        // 不立即停播放(stop 时可能还有已排队的尾音要播完)
        // 等尾音播完(keepSpeakingAnimation 收尾)后,再补发一次非 persistent
        // 的气泡,让它按 bubbleDurationMs 正常自动隐藏。
        scheduleBubbleDismissal()
      }
      break
    case 'audio-chunk':
      // M4:播放小智 TTS 下行音频(Float32 PCM 24kHz)
      if (voiceSettings().autoPlayTTS) {
        playPcmChunk(event.samples, event.sampleRate)
      }
      break
    case 'status':
      if (event.state === 'reconnecting') {
        showVoiceBubble(`🔄 正在重连小智...(第 ${event.attempt} 次)`)
      } else if (event.state === 'error') {
        showVoiceBubble(`⚠️ ${event.message || '连接出错,正在重连...'}`)
      } else if (event.state === 'disconnected') {
        showVoiceBubble('🔄 与小智断开,正在重连...')
      }
      break
    case 'vision-description':
      // 截屏描述已发给小智;不重复显示气泡(lookAndSay 已显示过提示),
      // 后续宠物台词由 tts 事件展示
      break
    case 'vision-error':
      showVoiceBubble(`⚠️ ${event.message || '看屏幕失败'}`)
      break
    default:
      break
  }
}

async function ensureConnected() {
  const status = await window.alwaysHere.voiceStatus()
  if (status.connected) return true
  await window.alwaysHere.voiceConnect()
  // 给一点时间完成 hello
  for (let i = 0; i < 30; i++) {
    const s = await window.alwaysHere.voiceStatus()
    if (s.connected) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

// 发送文字(M2 核心)
async function sendText(text) {
  const trimmed = (text || '').trim()
  if (!trimmed) return
  // 小智正在说话时,先打断再发新消息
  await interruptSpeaking()
  inputEl.value = ''
  // 发送后保持焦点在输入框,方便连续输入多条消息
  // (之前这里会 blur(),导致每次发完都要重新点输入框)
  inputEl.focus()
  setPetAnimation(VOICE_PHASE_ANIMATION.thinking)
  showVoiceBubble('🤔 思考中...')
  const connected = await ensureConnected()
  if (!connected) {
    showVoiceBubble('⚠️ 未连接到小智服务端,请在设置里检查地址')
    setPetAnimation(VOICE_PHASE_ANIMATION.idle)
    return
  }
  // P1-1:检测到便签相关意图时,把便签内容附带进去,让 AI 能回答"先做什么"
  const textToSend = enrichWithNoteContext(trimmed)
  await window.alwaysHere.voiceSendText(textToSend)
}

// 便签意图检测:用户问"先做什么/待办/该干嘛"时,把便签内容拼进 prompt
function enrichWithNoteContext(userText) {
  const noteIntent = /(先做|该做|待办|该干|做什么|安排|计划|任务|todo)/i.test(userText)
  if (!noteIntent) return userText
  const noteText = getConfigFn().noteText || ''
  if (!noteText.trim()) return userText
  // 截取前 500 字避免 prompt 过长
  const excerpt = noteText.length > 500 ? noteText.slice(0, 500) + '...' : noteText
  return `${userText}\n\n[用户便签内容]\n${excerpt}\n\n请结合便签内容回答。`
}

// 看屏幕说话:截屏 → 小智视觉描述 → 小智 LLM 以宠物口吻评论
async function lookAndSay() {
  if (!voiceSettings().enabled) {
    showVoiceBubble('⚠️ 请先在设置中开启语音功能')
    return
  }
  showVoiceBubble('👀 看一眼屏幕...')
  setPetAnimation(VOICE_PHASE_ANIMATION.thinking)
  const res = await window.alwaysHere.visionLookAndSay()
  if (!res?.ok) {
    showVoiceBubble(`⚠️ ${res?.error || '看屏幕失败'}`)
    setPetAnimation(VOICE_PHASE_ANIMATION.idle)
  }
  // 成功时:描述已发给小智,后续 tts 事件会展示宠物台词
}

function buildInputUI() {
  const widget = document.getElementById('widget-pet')
  if (!widget) return
  if (document.getElementById('pet-voice-bar')) return // 幂等

  const bar = document.createElement('div')
  bar.id = 'pet-voice-bar'
  bar.className = 'pet-voice-bar hidden'
  bar.innerHTML = `
    <button type="button" id="pet-mic-btn" class="pet-voice-btn mic" title="语音输入" aria-label="语音输入">
      <span class="pet-voice-mic-icon">🎤</span>
    </button>
    <input type="text" id="pet-voice-input" class="pet-voice-input"
           placeholder="聊天、问天气、查新闻..." autocomplete="off" maxlength="200" />
    <button type="button" id="pet-voice-send" class="pet-voice-btn send" title="发送" aria-label="发送">
      <span class="pet-voice-send-icon">➤</span>
    </button>
  `
  widget.appendChild(bar)

  inputEl = document.getElementById('pet-voice-input')
  micBtn = document.getElementById('pet-mic-btn')
  const sendBtn = document.getElementById('pet-voice-send')

  // 发送
  sendBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    sendText(inputEl.value)
  })
  inputEl.addEventListener('keydown', (e) => {
    e.stopPropagation() // 不触发拖拽/其它全局键
    if (e.key === 'Enter') {
      e.preventDefault()
      sendText(inputEl.value)
    } else if (e.key === 'Escape') {
      // Esc 只清空已输入内容,不隐藏整个输入栏
      // (隐藏后只能靠快捷键/托盘找回,体验不好)
      inputEl.value = ''
      inputEl.focus()
    }
  })
  inputEl.addEventListener('mousedown', (e) => e.stopPropagation())

  // 麦克风按钮(M5 接入真实采集;M2 先占位提示)
  micBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleMic()
  })
  micBtn.addEventListener('mousedown', (e) => e.stopPropagation())
}

function showVoiceBar() {
  const bar = document.getElementById('pet-voice-bar')
  if (bar) bar.classList.remove('hidden')
  if (inputEl) {
    // 等一帧再聚焦,确保已显示
    requestAnimationFrame(() => inputEl.focus())
  }
}

function hideVoiceBar() {
  const bar = document.getElementById('pet-voice-bar')
  if (bar) bar.classList.add('hidden')
  if (inputEl) inputEl.blur()
  // 隐藏输入栏时,如果正在录音必须停掉,否则麦克风指示灯一直亮(资源泄漏)
  if (listening) stopListening()
}

function toggleVoiceBar() {
  const bar = document.getElementById('pet-voice-bar')
  if (!bar) return
  if (bar.classList.contains('hidden')) showVoiceBar()
  else hideVoiceBar()
}

// 麦克风开关(M5 实现真实采集;此处先做连接 + 状态提示)
async function toggleMic() {
  if (!voiceSettings().enabled) {
    showVoiceBubble('⚠️ 请先在设置中开启语音功能')
    return
  }
  if (listening) {
    await stopListening()
  } else {
    await startListening()
  }
}

// ── 麦克风采集(M5:前端直连 mimo ASR) ──
// 流程:getUserMedia 采集 → AudioContext + ScriptProcessor 取 PCM →
//       转 WAV → IPC 送主进程 → mimo ASR → 识别文字 → 当作用户输入发给小智
let micStream = null
let micAudioCtx = null
let micScriptNode = null
let micPcmChunks = [] // 采集到的 Float32 样本

async function startListening() {
  // 小智正在说话时,先打断
  await interruptSpeaking()
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1, sampleRate: 16000 }
    })
  } catch (e) {
    showVoiceBubble('⚠️ 无法访问麦克风,请检查系统权限')
    return
  }
  micPcmChunks = []
  micAudioCtx = new AudioContext({ sampleRate: 16000 })
  const source = micAudioCtx.createMediaStreamSource(micStream)
  // ScriptProcessor 已废弃但最简单兼容;4096 样本缓冲
  micScriptNode = micAudioCtx.createScriptProcessor(4096, 1, 1)
  micScriptNode.onaudioprocess = (e) => {
    if (!listening) return
    // 拷贝一份(Float32),避免引用被复用
    const ch = e.inputBuffer.getChannelData(0)
    micPcmChunks.push(new Float32Array(ch))
  }
  source.connect(micScriptNode)
  micScriptNode.connect(micAudioCtx.destination)

  listening = true
  micBtn?.classList.add('listening')
  setPetAnimation(VOICE_PHASE_ANIMATION.listening)
  showVoiceBubble('🎤 在说呢,我听着~(再点结束)', { persistent: true })
}

async function stopListening() {
  listening = false
  micBtn?.classList.remove('listening')

  // 清理采集资源
  if (micScriptNode) { try { micScriptNode.disconnect() } catch {} micScriptNode = null }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null }
  const sampleRate = micAudioCtx?.sampleRate || 16000
  if (micAudioCtx) { try { micAudioCtx.close() } catch {} micAudioCtx = null }

  if (micPcmChunks.length === 0) {
    setPetAnimation(VOICE_PHASE_ANIMATION.idle)
    return
  }

  // 合并 PCM → 转 WAV → 送 mimo ASR
  showVoiceBubble('🎼 识别中...', { persistent: true })
  setPetAnimation(VOICE_PHASE_ANIMATION.thinking)
  const wavBuffer = pcmToWav(micPcmChunks, sampleRate)
  micPcmChunks = []
  const result = await window.alwaysHere.voiceAsr(wavBuffer.buffer)

  if (!result?.ok || !result.text) {
    showVoiceBubble('🤔 没听清,再说一次?')
    setPetAnimation(VOICE_PHASE_ANIMATION.idle)
    return
  }
  // 识别成功 → 当作用户文字输入发给小智
  await sendText(result.text)
}

// 把 Float32 PCM 块合并并转成 WAV ArrayBuffer(mimo ASR 要求 wav 格式)
function pcmToWav(chunks, sampleRate) {
  let totalLen = 0
  for (const c of chunks) totalLen += c.length
  const pcm16 = new Int16Array(totalLen)
  let offset = 0
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      // Float32 [-1,1] → Int16 [-32768,32767]
      const s = Math.max(-1, Math.min(1, chunk[i]))
      pcm16[offset++] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
  }
  // WAV 头(44 字节)+ PCM 数据
  const buffer = new ArrayBuffer(44 + pcm16.length * 2)
  const view = new DataView(buffer)
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + pcm16.length * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)        // PCM
  view.setUint16(22, 1, true)        // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true)        // block align
  view.setUint16(34, 16, true)       // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, pcm16.length * 2, true)
  // 写 PCM 数据
  let pos = 44
  for (let i = 0; i < pcm16.length; i++) {
    view.setInt16(pos, pcm16[i], true)
    pos += 2
  }
  return new Uint8Array(buffer)
}

function applyVoiceBarVisibility() {
  const enabled = voiceSettings().enabled
  const bar = document.getElementById('pet-voice-bar')
  if (!bar) return
  // 启用且宠物可见时显示输入栏入口(但默认收起,避免占桌面)
  if (enabled) {
    bar.classList.remove('hidden')
  } else {
    bar.classList.add('hidden')
    // 禁用时停掉正在进行的录音,释放麦克风
    if (listening) stopListening()
  }
}

// 处理快捷键 / 托盘来的 voice-toggle
function handleVoiceToggle() {
  if (!voiceSettings().enabled) {
    showVoiceBubble('⚠️ 请先在设置中开启语音功能')
    return
  }
  toggleVoiceBar()
}

export async function initPetVoice(getConfig, saveConfig) {
  getConfigFn = getConfig
  saveConfigFn = saveConfig

  buildInputUI()
  applyVoiceBarVisibility()

  // 下行事件
  window.alwaysHere.onVoiceEvent(handleVoiceEvent)

  // 页面关闭/隐藏时释放麦克风(避免麦克风指示灯常亮)
  window.addEventListener('pagehide', () => { if (listening) stopListening() })
  window.addEventListener('beforeunload', () => { if (listening) stopListening() })

  // 快捷键 / 托盘触发(复用现有 tray-command 路由)
  window.addEventListener('tray-command', (event) => {
    const payload = event.detail
    const command = typeof payload === 'string' ? payload : payload?.type
    if (command === 'voice-toggle') handleVoiceToggle()
    if (command === 'vision-look') lookAndSay()
  })

  // 点击宠物时,若输入栏被隐藏则重新唤出(找回入口)
  window.addEventListener('pet-voice-show-bar', () => {
    const bar = document.getElementById('pet-voice-bar')
    if (bar?.classList.contains('hidden')) showVoiceBar()
  })

  // 注:打断已改为发送消息时触发,不再在点击宠物时打断(见 sendText)

  // 登记本端发给小智的"引导 prompt"(如宠物主动找话)。
  // 这类文本是发给 AI 的指令,detect 模式仍会回 stt,但不应在气泡里当作用户发言显示。
  window.addEventListener('pet-voice-system-prompt', (event) => {
    const text = typeof event.detail === 'string' ? event.detail : event.detail?.text
    if (text) markSystemPrompt(text)
  })

  // 设置变更后刷新可见性
  window.addEventListener('voice-settings-changed', () => {
    applyVoiceBarVisibility()
  })
}
