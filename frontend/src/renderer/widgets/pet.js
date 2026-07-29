import {
  CELL_HEIGHT,
  CELL_WIDTH,
  getAnimation,
  getDragActionFromMovement,
  getFrameDuration,
  getFrameSource,
  getSupportedActions,
  pickAmbientAction,
  pickAmbientActionByContext,
  resolvePetAction,
  V1_ACTIONS
} from './petAnimations.mjs'
import {
  getDueReminderEvents,
  normalizeReminders
} from './petReminders.mjs'
import {
  createReminderResponseEvent,
  getReminderBubbleDuration
} from './petReminderBubble.mjs'
import {
  calculateHappiness,
  getMoodLevel
} from './petHappiness.mjs'
import {
  PET_CHAT_BUBBLE_DURATION_MS,
  PET_CHAT_TONES,
  getPetChatIntervalMs,
  normalizePetChatSettings,
  getPetChatLines,
  pickPetChatLine,
  shouldShowPetChat
} from './petChatter.mjs'
import { appendActivityLog } from '../utils/activityLog.mjs'
import { summarizeRecentDays } from '../utils/activityStats.mjs'
import { PET_EVENTS } from '../utils/events.mjs'

const CANVAS_WIDTH = 130
const CANVAS_HEIGHT = 150

let spriteImg = null
let getConfigFn = null
let saveConfigFn = null
let animTimer = null
let actionTimer = null
let reminderTimer = null
let chatTimer = null
let bubbleTimeout = null
let frameIndex = 0
let currentAnimation = 'idle'
let currentSemanticAction = 'idle'
let currentActionRole = 'base'
let baseAction = 'idle'
let supportedActions = new Set(V1_ACTIONS)
let currentPetId = null
let lastAmbientAction = null
let lastDragAction = null
let lastPetChatLine = null
let pendingReminderEvent = null
let isFocusing = false
let isDragging = false
let idleStateTimer = null
let lastInteractionAt = Date.now()
const persistentEmotes = new Map()
const IDLE_SLEEP_DELAY_MS = 10 * 60 * 1000
let reminderState = {
  lastHourlyKey: null,
  lastWaterAt: null,
  lastSedentaryAt: null,
  firedWorkKeys: new Set()
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function drawFallback() {
  const canvas = document.getElementById('pet-canvas')
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = '56px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('?', canvas.width / 2, canvas.height / 2)
}

function drawPetFrame() {
  const canvas = document.getElementById('pet-canvas')
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (!spriteImg) {
    drawFallback()
    return
  }

  const { sx, sy, sw, sh } = getFrameSource(currentAnimation, frameIndex)
  const scale = Math.min(canvas.width / CELL_WIDTH, canvas.height / CELL_HEIGHT)
  const dw = CELL_WIDTH * scale
  const dh = CELL_HEIGHT * scale
  const dx = (canvas.width - dw) / 2
  const dy = canvas.height - dh

  ctx.drawImage(spriteImg, sx, sy, sw, sh, dx, dy, dw, dh)
}

function scheduleNextFrame() {
  if (animTimer) clearTimeout(animTimer)
  const duration = getFrameDuration(currentAnimation, frameIndex)
  animTimer = setTimeout(() => {
    const animation = getAnimation(currentAnimation)
    if (currentActionRole === 'transient' && frameIndex >= animation.frames - 1) {
      finishCurrentAction()
      return
    } else {
      frameIndex = (frameIndex + 1) % animation.frames
    }
    drawPetFrame()
    scheduleNextFrame()
  }, duration)
}

function randomActionDelay() {
  return 12000 + Math.floor(Math.random() * 18000)
}

function playAction(actionName) {
  if (!spriteImg) return
  startAction(actionName, 'transient')
}

function startAction(actionName, role) {
  clearActionEmotes(currentSemanticAction)
  currentSemanticAction = actionName
  currentAnimation = resolvePetAction(actionName, supportedActions)
  currentActionRole = role
  frameIndex = 0
  showActionEmotes(actionName)
  drawPetFrame()
  scheduleNextFrame()
}

function finishCurrentAction() {
  clearActionEmotes(currentSemanticAction)
  startAction(baseAction, 'base')
}

function setBaseAction(actionName) {
  baseAction = actionName
  startAction(actionName, 'base')
}

function markInteraction() {
  lastInteractionAt = Date.now()
  if (baseAction === 'sleep') setBaseAction(isFocusing ? 'study' : 'idle')
}

function evaluateIdleState(now = Date.now()) {
  if (baseAction === 'sleep' || isFocusing || isDragging || pendingReminderEvent) return
  if (now - lastInteractionAt >= IDLE_SLEEP_DELAY_MS) setBaseAction('sleep')
}

function showEmote(symbol, options = {}) {
  const layer = document.getElementById('pet-emote-layer')
  if (!layer) return null
  const element = document.createElement('span')
  element.className = `pet-emote ${options.variant || 'float'}`
  element.textContent = symbol
  element.style.setProperty('--emote-x', `${options.x ?? Math.round(Math.random() * 44 - 22)}px`)
  layer.appendChild(element)
  const remove = () => element.remove()
  element.addEventListener('animationend', remove, { once: true })
  setTimeout(remove, options.duration || 2400)
  return element
}

function showEmoteBurst(symbols) {
  symbols.forEach((symbol, index) => {
    setTimeout(() => showEmote(symbol, { x: -28 + index * 18 }), index * 80)
  })
}

function showPersistentEmote(key, symbol) {
  if (persistentEmotes.has(key)) return
  const layer = document.getElementById('pet-emote-layer')
  if (!layer) return
  const element = document.createElement('span')
  element.className = 'pet-emote persistent'
  element.textContent = symbol
  element.dataset.emoteKey = key
  layer.appendChild(element)
  persistentEmotes.set(key, element)
}

function clearPersistentEmote(key) {
  persistentEmotes.get(key)?.remove()
  persistentEmotes.delete(key)
}

function showActionEmotes(action) {
  if (action === 'sleep' || action === 'yawn') showPersistentEmote(action, 'Zzz')
  if (action === 'dance') showPersistentEmote(action, '♪')
  if (action === 'cheer') showEmoteBurst(['✨', '★', '✨'])
  if (action === 'stomp') showEmoteBurst(['💢', '!'])
}

function clearActionEmotes(action) {
  clearPersistentEmote(action)
}

function maybeCelebrateHappiness(previous, next) {
  if (previous <= 80 && next > 80) showEmoteBurst(['♡', '♥', '✨', '♡'])
}

function setBubbleActionsVisible(visible) {
  const actions = document.getElementById('pet-bubble-actions')
  if (actions) actions.classList.toggle('hidden', !visible)
}

function hideBubble() {
  const bubble = document.getElementById('pet-bubble')
  if (bubbleTimeout) {
    clearTimeout(bubbleTimeout)
    bubbleTimeout = null
  }
  if (bubble) {
    bubble.classList.add('hidden')
    bubble.classList.remove('thinking')
  }
  setBubbleActionsVisible(false)
  pendingReminderEvent = null
}

function finishPendingReminder(result) {
  if (!pendingReminderEvent) {
    hideBubble()
    return
  }
  const reminderType = pendingReminderEvent.type
  const config = getConfigFn()
  const event = createReminderResponseEvent(pendingReminderEvent, result)
  appendActivityLog(config, event)
  
  // Update happiness
  const previousHappiness = config.happiness
  config.happiness = calculateHappiness(config.happiness, event)
  maybeCelebrateHappiness(previousHappiness, config.happiness)
  
  saveConfigFn()
  hideBubble()
  markInteraction()
  if (result === 'done') {
    const doneAction = reminderType === 'water' ? 'nod' : reminderType === 'sedentary' ? 'stretch' : null
    if (doneAction) playAction(doneAction)
  }
}

// 视口安全边距:气泡各边距屏幕边缘至少保留这么多像素
const BUBBLE_VIEWPORT_MARGIN = 8
// 气泡与宠子的间距(与 CSS 中 margin 保持一致)
const BUBBLE_GAP = 16
// 候选方向优先级:默认向上,溢出时按 右 → 左 → 下 依次尝试
const BUBBLE_DIRECTIONS = ['top', 'right', 'left', 'bottom']
const BUBBLE_POS_CLASSES = ['bubble-pos-top', 'bubble-pos-right', 'bubble-pos-left', 'bubble-pos-bottom']

// 预测气泡在某方向渲染时的视口矩形(left/top/right/bottom)
// petRect: 伙伴 widget 的视口矩形;bw/bh: 气泡宽高
function predictBubbleRect(direction, petRect, bw, bh) {
  const gap = BUBBLE_GAP
  switch (direction) {
    case 'top': {
      // 向上生长、水平居中
      const right = petRect.left + petRect.width / 2 + bw / 2
      const left = petRect.left + petRect.width / 2 - bw / 2
      const bottom = petRect.top - gap
      const top = bottom - bh
      return { left, top, right, bottom }
    }
    case 'bottom': {
      const right = petRect.left + petRect.width / 2 + bw / 2
      const left = petRect.left + petRect.width / 2 - bw / 2
      const top = petRect.bottom + gap
      const bottom = top + bh
      return { left, top, right, bottom }
    }
    case 'right': {
      const left = petRect.right + gap
      const right = left + bw
      const top = petRect.top + petRect.height / 2 - bh / 2
      const bottom = top + bh
      return { left, top, right, bottom }
    }
    case 'left': {
      const right = petRect.left - gap
      const left = right - bw
      const top = petRect.top + petRect.height / 2 - bh / 2
      const bottom = top + bh
      return { left, top, right, bottom }
    }
  }
}

function isRectInViewport(r) {
  const m = BUBBLE_VIEWPORT_MARGIN
  return r.left >= m && r.right <= window.innerWidth - m &&
    r.top >= m && r.bottom <= window.innerHeight - m
}

// 根据伙伴在屏幕上的位置,把气泡放到一个能完整显示的方向。
// 优先级:上(默认) → 右 → 左 → 下;都不够空间则钳制在视口内。
function positionBubble() {
  const bubble = document.getElementById('pet-bubble')
  const pet = document.getElementById('widget-pet')
  if (!bubble || !pet) return

  // 清除上次的方向类与行内定位修正,回到默认(向上)
  BUBBLE_POS_CLASSES.forEach(c => bubble.classList.remove(c))
  bubble.style.top = ''
  bubble.style.left = ''
  bubble.style.right = ''
  bubble.style.bottom = ''
  bubble.style.transform = ''

  // 强制布局,测量默认方向下的真实气泡尺寸 + 伙伴矩形
  const petRect = pet.getBoundingClientRect()
  const bw = bubble.offsetWidth
  const bh = bubble.offsetHeight

  const m = BUBBLE_VIEWPORT_MARGIN
  for (const dir of BUBBLE_DIRECTIONS) {
    const r = predictBubbleRect(dir, petRect, bw, bh)
    if (isRectInViewport(r)) {
      bubble.classList.add('bubble-pos-' + dir)
      return
    }
  }

  // 极端情况:四方向都不够空间。保持默认向上,但钳制到视口内尽量完整显示。
  bubble.classList.add('bubble-pos-top')
  const defaultRect = predictBubbleRect('top', petRect, bw, bh)
  // 若顶部溢出,用行内 top 把气泡顶部拉到安全边距(覆盖 CSS 的 bottom 锚定)
  if (defaultRect.top < m) {
    bubble.style.bottom = 'auto'
    bubble.style.top = m + 'px'
    // left 可能也溢出(气泡比伙伴宽时),钳制水平
    if (defaultRect.left < m) {
      bubble.style.left = m + 'px'
      bubble.style.transform = 'none'
    } else if (defaultRect.right > window.innerWidth - m) {
      bubble.style.left = (window.innerWidth - m - bw) + 'px'
      bubble.style.transform = 'none'
    }
  }
}

function showBubble(text, options = {}) {
  const bubble = document.getElementById('pet-bubble')
  const bubbleText = document.getElementById('pet-bubble-text')
  const moodIndicator = document.getElementById('pet-mood-indicator')
  if (!bubble || !bubbleText) return

  if (moodIndicator) {
    const config = getConfigFn()
    const mood = getMoodLevel(config.happiness)
    moodIndicator.textContent = mood === 'happy' ? '😊' : mood === 'grumpy' ? '💢' : '😐'
  }

  bubbleText.textContent = text
  bubble.classList.remove('hidden')
  setBubbleActionsVisible(Boolean(options.confirmable))
  // 气泡显示后,根据伙伴在屏幕上的位置自动选择一个不超出视口的方向
  positionBubble()
  if (bubbleTimeout) clearTimeout(bubbleTimeout)
  // persistent:不设自动关闭计时(语音回复用——逐句更新气泡,
  // 等 TTS 真正说完后由调用方再触发一次带 duration 的 showBubble 收尾)
  if (options.persistent) return
  bubbleTimeout = setTimeout(() => {
    if (options.confirmable) {
      finishPendingReminder('timeout')
      return
    }
    hideBubble()
  }, getReminderBubbleDuration(options))
}

function handleReminderEvent(event) {
  markInteraction()
  const confirmable = event.type === 'water' || event.type === 'sedentary'
  pendingReminderEvent = confirmable ? event : null
  showBubble(event.text, { confirmable })
  showEmote('!')
  playAction(event.action || 'waving')
  if (event.systemNotification) {
    window.alwaysHere.showNotification({
      title: event.title || 'Always Here',
      body: event.text
    })
  }
}

function recordReminderResult(result) {
  if (result !== 'done' && result !== 'skipped') return
  finishPendingReminder(result)
}

function checkReminders() {
  const config = getConfigFn()
  const reminders = normalizeReminders(config.reminders)
  const events = getDueReminderEvents(new Date(), reminders, reminderState, config)
  events.forEach(handleReminderEvent)
}

function startReminderLoop() {
  if (reminderTimer) clearInterval(reminderTimer)
  const now = new Date()
  const config = getConfigFn()
  const reminders = normalizeReminders(config.reminders)
  // 启动时把"上次提醒时间"回拨一个间隔,使首次 checkReminders 立即触发,
  // 避免每次重启都要干等 30~60 分钟才弹第一次提醒
  if (!reminderState.lastWaterAt) {
    reminderState.lastWaterAt = new Date(now.getTime() - reminders.water.intervalMinutes * 60 * 1000)
  }
  if (!reminderState.lastSedentaryAt) {
    reminderState.lastSedentaryAt = new Date(now.getTime() - reminders.sedentary.intervalMinutes * 60 * 1000)
  }
  checkReminders()
  reminderTimer = setInterval(checkReminders, 1000)
}

// 基于真实行为数据构建上下文 prompt,让 AI 生成的台词有针对性
// 把喝水/久坐/加班/番茄钟/好感度/时间段 都拼进去
function buildContextPrompt(config) {
  const recent = summarizeRecentDays(config.activityLog || [], 7)
  const happiness = config.happiness ?? 70
  const mood = getMoodLevel(happiness)
  const hour = new Date().getHours()
  const period = hour < 6 ? '深夜' : hour < 11 ? '早上' : hour < 14 ? '中午' : hour < 18 ? '下午' : hour < 23 ? '晚上' : '深夜'

  const ctx = []
  if (recent.waterMissed > 0) ctx.push(`最近7天漏了${recent.waterMissed}次喝水提醒`)
  if (recent.sedentaryMissed > 0) ctx.push(`久坐提醒被忽略${recent.sedentaryMissed}次`)
  if (recent.totalOvertimeMs > 0) {
    const hrs = Math.floor(recent.totalOvertimeMs / 3600000)
    if (hrs > 0) ctx.push(`最近加班约${hrs}小时`)
  }
  if (recent.workStops > 0) ctx.push(`正常下班${recent.workStops}次`)
  const moodDesc = mood === 'happy' ? '心情很好(好感度高,可以更活泼亲昵一点)' : mood === 'grumpy' ? '有点小委屈(用户最近没好好照顾自己,你有点担心又有点心疼,但还是温柔地关心他,语气软软的,绝对不要冷淡)' : '心情平稳'

  // 便签待办统计(P1-2:定时提醒未完成的待办)
  const noteTodos = countNoteTodos(config.noteText)
  if (noteTodos > 0) ctx.push(`便签里还有${noteTodos}个待办没完成`)

  const ctxText = ctx.length > 0 ? `\n[行为数据] ${ctx.join('、')}` : ''
  return `你是桌面陪伴伙伴,现在是${period}。${moodDesc}${ctxText}
基于以上信息,主动跟用户说一句话(20字以内),自然不机械。如果有该关心的(如漏喝水/久坐/待办),优先关心;没有就轻松聊一句。`
}

// 统计便签里未完成的待办数(支持 - [ ] 格式)
function countNoteTodos(noteText) {
  if (!noteText || typeof noteText !== 'string') return 0
  const matches = noteText.match(/- \[ \]/g)
  return matches ? matches.length : 0
}

// 从写死台词池里挑一句(作为 AI 不可用时的回落)
function pickLocalChatLine(tone) {
  const config = getConfigFn()
  const recent = summarizeRecentDays(config.activityLog || [], 7)
  const lines = getPetChatLines(new Date(), {
    tone: tone,
    activityContext: {
      missedWaterCount: recent.waterMissed,
      missedSedentaryCount: recent.sedentaryMissed,
      overtimeMinutes: Math.floor(recent.totalOvertimeMs / 60000),
      wageman: config.wageman
    }
  })
  lastPetChatLine = pickPetChatLine({
    previousLine: lastPetChatLine,
    lines,
    happiness: config.happiness
  })
  return lastPetChatLine
}

// 优先走小智 AI 生成台词;未连接/失败时回落到写死台词
async function showPetChat(options = {}) {
  const config = getConfigFn()
  const chatSettings = normalizePetChatSettings(config.petChat)
  const bubble = document.getElementById('pet-bubble')
  const bubbleVisible = bubble ? !bubble.classList.contains('hidden') : false
  if (!shouldShowPetChat({
    enabled: chatSettings.enabled,
    quietMode: chatSettings.quietMode,
    hasPendingReminder: Boolean(pendingReminderEvent),
    bubbleVisible,
    force: Boolean(options.force)
  })) return

  const tone = options.tone || chatSettings.tone

  // 语音已启用时,尝试走小智 AI
  if (config.voice?.enabled) {
    const aiOk = await tryAiChat(options.aiPrompt || buildContextPrompt(config))
    if (aiOk) return
    // AI 不可用 → 回落本地台词(继续往下)
  }

  // 回落:写死台词
  showBubble(pickLocalChatLine(tone), { duration: PET_CHAT_BUBBLE_DURATION_MS })
  if (currentAnimation === 'idle') playAction('waving')
}

// 调小智 AI 说一句;成功返回 true(气泡/动画由 voice 事件驱动)
// prompt 可选,用于引导 AI 生成"主动陪伴/单击"类台词;不传则让小智自由发挥
async function tryAiChat(prompt) {
  try {
    const status = await window.alwaysHere.voiceStatus()
    let connected = status.connected
    if (!connected) {
      // 尝试自动连接(只在已启用时)
      await window.alwaysHere.voiceConnect()
      for (let i = 0; i < 20; i++) {
        const s = await window.alwaysHere.voiceStatus()
        if (s.connected) { connected = true; break }
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    if (!connected) return false
    // 等待 AI 回复期间给个思考提示 + 动画
    showBubble('🤔 想想说什么...', { duration: 5000 })
    if (currentAnimation === 'idle') playAction('review')
    // 引导小智主动开口;不传具体内容时,只给一个轻量提示,不强制指令式文案
    const text = prompt || '跟我打个招呼吧'
    // 登记:这是发给小智的引导指令,服务端 detect 模式会把它当 stt 回显,
    // 但它不是真实用户发言,不应出现在前台气泡(petVoice.mjs 据此过滤)
    window.dispatchEvent(new CustomEvent(PET_EVENTS.PET_VOICE_SYSTEM_PROMPT, { detail: text }))
    const res = await window.alwaysHere.voiceSendSystemText(text)
    return Boolean(res?.ok)
  } catch {
    return false
  }
}

function startPetChatLoop() {
  if (chatTimer) clearInterval(chatTimer)
  const config = getConfigFn()
  const chatSettings = normalizePetChatSettings(config.petChat)
  config.petChat = chatSettings

  // 视觉(看屏幕)已启用时,主动聊天交给“用户未回复”计时器,
  // 不再跑这个"无脑定时蹦台词"的循环,避免频繁打扰
  if (config.vision?.enabled) {
    chatTimer = null
    return
  }
  // 视觉未启用时:保留本地写死台词兜底(离线陪伴)
  if (!chatSettings.enabled || chatSettings.quietMode) {
    chatTimer = null
    return
  }
  chatTimer = setInterval(showPetChat, getPetChatIntervalMs(chatSettings))
}

function scheduleAmbientAction(delay = randomActionDelay()) {
  if (actionTimer) clearTimeout(actionTimer)
  actionTimer = setTimeout(() => {
    if (currentAnimation === 'idle' && !isFocusing) {
      lastAmbientAction = pickAmbientActionByContext({
        happiness: getConfigFn().happiness,
        lastAction: lastAmbientAction
      })
      playAction(lastAmbientAction)
    }
    scheduleAmbientAction()
  }, delay)
}

async function loadConfiguredPet() {
  const config = getConfigFn()
  const nextPetId = config.petId || 'hina'
  currentPetId = nextPetId

  try {
    const result = await window.alwaysHere.getPetSpritesheet(nextPetId)
    if (currentPetId !== result.id) return
    const loadedImage = await loadImage(result.dataUrl)
    if (currentPetId !== result.id) return
    spriteImg = loadedImage
    supportedActions = getSupportedActions(result.supportedActions, loadedImage.height)
    baseAction = 'idle'
    startAction('idle', 'base')
  } catch (error) {
    console.warn('Failed to load pet:', error)
    spriteImg = null
    drawFallback()
  }
}

export async function initPet(getConfig, saveConfig) {
  getConfigFn = getConfig
  saveConfigFn = saveConfig

  const canvas = document.getElementById('pet-canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT

  if (!getConfigFn().petId) {
    getConfigFn().petId = 'hina'
    saveConfigFn()
  }

  await loadConfiguredPet()
  scheduleNextFrame()
  scheduleAmbientAction(4000)
  startReminderLoop()
  startPetChatLoop()
  if (idleStateTimer) clearInterval(idleStateTimer)
  idleStateTimer = setInterval(evaluateIdleState, 30000)

  window.addEventListener(PET_EVENTS.PET_SELECTION_CHANGED, async () => {
    markInteraction()
    await loadConfiguredPet()
  })

  window.addEventListener(PET_EVENTS.REMINDER_SETTINGS_CHANGED, (event) => {
    const now = new Date()
    if (event.detail?.type === 'water') reminderState.lastWaterAt = now
    if (event.detail?.type === 'sedentary') reminderState.lastSedentaryAt = now
    checkReminders()
  })

  window.addEventListener(PET_EVENTS.PET_CHAT_SETTINGS_CHANGED, () => {
    startPetChatLoop()
  })

  window.addEventListener(PET_EVENTS.TRAY_COMMAND, (event) => {
    const payload = event.detail
    const command = typeof payload === 'string' ? payload : payload.type
    if (command === 'pet-say-now') {
      const toneLabel = PET_CHAT_TONES.find(t => t.id === payload.tone)?.label || '陪伴'
      showPetChat({
        force: true,
        tone: payload.tone,
        aiPrompt: `用${toneLabel}的语气,主动跟我说一句简短的话(15字以内)。`
      })
    }
    if (command === 'toggle-pet-quiet-mode') {
      // handled by tray logic usually, but ensure we update if needed
      startPetChatLoop()
    }
  })

  window.addEventListener(PET_EVENTS.PET_REMINDER, (event) => {
    if (event.detail?.text) handleReminderEvent(event.detail)
  })

  // 小智对话回复气泡:复用同一气泡。
  // persistent 标记表示"小智正在说话,气泡逐句更新,不要自动关闭",
  // 由 petVoice 在 TTS 说完后补发一次带 duration 的回复来收尾(自动隐藏)。
  window.addEventListener(PET_EVENTS.PET_VOICE_REPLY, (event) => {
    const bubble = document.getElementById('pet-bubble')
    if (!event.detail?.text) return
    // 思考中:工具调用期间(petVoice 检测到 "% <function>" stt 回显后发来 'think' 标记),
    // 展示三点跳动的 loading 样式(详见 pet.css .thinking)。
    // 后续 tts 的 sentence_start 会发普通 💬 消息,自动覆盖并清除 .thinking。
    if (event.detail.text === 'think') {
      if (bubble) bubble.classList.add('thinking')
      showBubble('想想看...', { persistent: true })
      return
    }
    // 非思考态消息:清除上一次可能残留的 thinking 样式
    if (bubble) bubble.classList.remove('thinking')
    if (event.detail.persistent) {
      showBubble(event.detail.text, { persistent: true })
    } else {
      const duration = getConfigFn().voice?.bubbleDurationMs || 8000
      showBubble(event.detail.text, { duration })
    }
  })

  window.addEventListener(PET_EVENTS.PET_ACTION, (event) => {
    if (typeof event.detail === 'string') playAction(event.detail)
  })

  window.addEventListener(PET_EVENTS.PET_EMOTE, (event) => {
    if (typeof event.detail === 'string') showEmote(event.detail)
  })

  window.addEventListener(PET_EVENTS.POMODORO_START, () => {
    markInteraction()
    isFocusing = true
    setBaseAction('study')
  })

  window.addEventListener(PET_EVENTS.POMODORO_STOP, () => {
    isFocusing = false
    if (baseAction === 'study') setBaseAction('idle')
  })

  window.addEventListener(PET_EVENTS.POMODORO_DONE, (event) => {
    const config = getConfigFn()
    const previousHappiness = config.happiness
    config.happiness = calculateHappiness(config.happiness, { type: 'pomodoro-done' })
    maybeCelebrateHappiness(previousHappiness, config.happiness)
    saveConfigFn()
    setBaseAction('idle')
    playAction('cheer')
    // 番茄钟完成 → AI 生成个性化鼓励(基于今日完成数)
    if (config.voice?.enabled) {
      const recent = summarizeRecentDays(config.activityLog || [], 1)
      const prompt = `用户刚完成了一个番茄钟(今日已完成约${recent.entries}条行为记录,好感度${config.happiness})。用桌面陪伴伙伴的口吻,鼓励一句(15字以内),带点成就感。`
      tryAiChat(prompt)
    }
  })

  window.addEventListener(PET_EVENTS.WORK_STOP, (event) => {
    markInteraction()
    // work-stop event detail contains the activity entry
    const config = getConfigFn()
    const previousHappiness = config.happiness
    config.happiness = calculateHappiness(config.happiness, event.detail)
    maybeCelebrateHappiness(previousHappiness, config.happiness)
    saveConfigFn()
    // 下班 → AI 生成个性化播报(薪资/加班情况)
    if (config.voice?.enabled) {
      const w = config.wageman || {}
      const recent = summarizeRecentDays(config.activityLog || [], 7)
      const overtimeHrs = Math.floor(recent.totalOvertimeMs / 3600000)
      let prompt = `用户刚下班了。`
      if (w.monthlySalary && w.workDays) {
        const daily = Math.round(Number(w.monthlySalary) / (Number(w.workDays) || 22))
        prompt += `日薪约${daily}元。`
      }
      if (overtimeHrs > 0) prompt += `最近加班约${overtimeHrs}小时。`
      prompt += `用桌面陪伴伙伴的口吻,说一句下班播报(20字以内),可以提到收入或鼓励休息。`
      tryAiChat(prompt)
    }
  })

  const widget = document.getElementById('widget-pet')
  const bubbleActions = document.getElementById('pet-bubble-actions')
  bubbleActions?.addEventListener('click', (event) => {
    event.stopPropagation()
    const result = event.target?.dataset?.result
    if (result === 'done' || result === 'skipped') recordReminderResult(result)
  })
  bubbleActions?.addEventListener('mousedown', (event) => {
    event.stopPropagation()
  })

  widget.addEventListener('mouseenter', () => {
    markInteraction()
    if (currentAnimation === 'idle') playAction('waving')
  })

  widget.addEventListener('click', () => {
    markInteraction()
    // 若语音输入栏被隐藏(如刚按过 Esc),单击先把它唤回来,不挥手
    const voiceBar = document.getElementById('pet-voice-bar')
    if (voiceBar?.classList.contains('hidden')) {
      window.dispatchEvent(new CustomEvent(PET_EVENTS.PET_VOICE_SHOW_BAR))
      return
    }
    // 单击只做挥手回应,不触发对话(避免频繁打扰/联网)
    // 注:打断改为发送消息时触发(见 petVoice.mjs 的 sendText)
    if (currentAnimation === 'idle') playAction('waving')
  })

  widget.addEventListener('dblclick', () => {
    markInteraction()
    const action = (getConfigFn().happiness ?? 70) > 80 ? 'spin' : pickAmbientAction(currentSemanticAction)
    playAction(action)
  })

  widget.addEventListener(PET_EVENTS.WIDGET_DRAG, (event) => {
    markInteraction()
    isDragging = true
    const action = getDragActionFromMovement(
      event.detail?.deltaX || 0,
      event.detail?.totalDeltaX || 0
    )
    if (!action || action === lastDragAction) return
    lastDragAction = action
    playAction(action)
  })

  widget.addEventListener(PET_EVENTS.WIDGET_DRAG_END, () => {
    markInteraction()
    isDragging = false
    lastDragAction = null
    startAction(baseAction, 'base')
  })
}
