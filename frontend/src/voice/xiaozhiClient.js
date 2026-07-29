// 小智 ESP32 服务端 WebSocket 协议客户端(主进程 / Node 侧)
//
// 为什么放主进程:渲染进程被 contextIsolation:true + nodeIntegration:false 锁死,
// 无法直接用 Node 的 WebSocket/原生模块。主进程用 `ws` 包(Node 生态最成熟的 WebSocket 库,
// 纯 JS 无 native 依赖)。注意:Electron 33 / Node 20 主进程没有全局 WebSocket,必须用 ws 包。
//
// 协议要点(已在调研中逐行核对服务端源码):
//  - 端点:ws://host:port/xiaozhi/v1/ (路径是约定,Python 服务端虽不强制校验但所有参考客户端都用)
//  - Device-Id 必填(浏览器/Electron 不便设自定义 WS 头,改用 ?device-id= 查询参数)
//  - 上行音频必须 16kHz/单声道/60ms(960 样本)Opus,无论 hello 里写什么(服务端硬编码按 16k 解码)
//  - 下行按服务端 hello 声明的 sample_rate(默认 24000)解码
//  - 文字对话:发 listen {state:'detect', text},无需音频,服务端仍会回 TTS 音频

const WebSocket = require('ws')

const AWAIT_HELLO_TIMEOUT_MS = 8000

/**
 * @param {object} opts
 * @param {object} opts.voiceConfig normalizeVoiceSettings 的产物 {serverUrl, deviceId, clientId, token}
 * @param {(event:object)=>void} opts.onEvent 下行事件回调
 *   事件类型:
 *     {type:'hello', sessionId, audioParams}
 *     {type:'stt', text}
 *     {type:'llm', text, emotion}
 *     {type:'tts', state:'start'|'sentence_start'|'stop', text?}
 *     {type:'audio', data:Buffer}  // 下行 Opus 二进制帧
 *     {type:'status', state:'connected'|'disconnected'|'error', message?, reconnectIn?}
 */
function createXiaozhiClient({ voiceConfig, onEvent }) {
  let ws = null
  let sessionId = null
  let serverAudioParams = null
  let manualClosed = false
  let helloReceived = false

  function emit(event) {
    try {
      onEvent(event)
    } catch (e) {
      console.error('[xiaozhi] onEvent threw:', e)
    }
  }

  // 把 device-id/client-id/authorization 拼进查询参数(浏览器无法设自定义 WS 头)
  // voice:用户在设置里选的 TTS 音色,下发给服务端作为本次会话的 private_voice 覆盖。
  function buildUrl() {
    const base = voiceConfig.serverUrl
    const params = new URLSearchParams()
    if (voiceConfig.deviceId) params.set('device-id', voiceConfig.deviceId)
    if (voiceConfig.clientId) params.set('client-id', voiceConfig.clientId)
    if (voiceConfig.token) params.set('authorization', `Bearer ${voiceConfig.token}`)
    if (voiceConfig.ttsVoice) params.set('voice', voiceConfig.ttsVoice)
    const sep = base.includes('?') ? '&' : '?'
    return params.toString() ? `${base}${sep}${params.toString()}` : base
  }

  function sendJson(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(obj))
    return true
  }

  function handleText(data) {
    let msg
    try {
      msg = JSON.parse(data)
    } catch {
      return // 服务端会把非 JSON / 纯数字原样回显,忽略
    }
    switch (msg.type) {
      case 'hello':
        sessionId = msg.session_id || null
        serverAudioParams = msg.audio_params || null
        helloReceived = true
        emit({ type: 'hello', sessionId, audioParams: serverAudioParams })
        break
      case 'stt':
        emit({ type: 'stt', text: msg.text || '' })
        break
      case 'llm':
        emit({ type: 'llm', text: msg.text || '', emotion: msg.emotion || '' })
        break
      case 'tts':
        emit({ type: 'tts', state: msg.state, text: msg.text || '' })
        break
      case 'mcp':
      case 'iot':
      case 'system':
      case 'alert':
        // M2 暂不处理;保持连接不中断
        break
      default:
        break
    }
  }

  function connect() {
    manualClosed = false
    helloReceived = false
    // 单次连接内有效:hello 超时主动关闭时置位,避免 close 事件再 emit disconnected,
    // 进而触发主进程重连 → 又超时的无效循环(重连逻辑已在 error 事件里触发,不会漏)。
    let helloTimeoutClosed = false
    const url = buildUrl()
    try {
      ws = new WebSocket(url)
    } catch (e) {
      emit({ type: 'status', state: 'error', message: e.message })
      return
    }

    const helloTimer = setTimeout(() => {
      if (!helloReceived) {
        helloTimeoutClosed = true
        emit({
          type: 'status',
          state: 'error',
          message: '等待服务端 hello 响应超时(确认地址/鉴权正确)'
        })
        try { ws.close() } catch { /* noop */ }
      }
    }, AWAIT_HELLO_TIMEOUT_MS)

    ws.on('open', () => {
      // 发 hello:声明本端上行能力 16k/单声道/60ms Opus
      sendJson({
        type: 'hello',
        version: 1,
        transport: 'websocket',
        audio_params: {
          format: 'opus',
          sample_rate: 16000,
          channels: 1,
          frame_duration: 60
        }
      })
    })

    ws.on('message', (raw, isBinary) => {
      clearTimeout(helloTimer)
      // ws 包:文本消息 raw 是 Buffer 对象(typeof 'object')但 isBinary=false;
      // 二进制消息 isBinary=true。必须用 isBinary 判断,不能用 typeof。
      if (!isBinary) {
        // 文本消息(可能是 Buffer 或 String),统一转成字符串解析
        handleText(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw))
      } else {
        // 下行 Opus 二进制帧(原始 Opus,无头)
        emit({ type: 'audio', data: Buffer.isBuffer(raw) ? raw : Buffer.from(raw) })
      }
    })

    ws.on('close', () => {
      clearTimeout(helloTimer)
      // hello 超时主动关闭:已 emit 过 error,且主进程会在 error 里安排重连,
      // 这里不再重复 emit disconnected,避免错误状态下刷屏重连日志。
      if (!manualClosed && !helloTimeoutClosed) {
        emit({ type: 'status', state: 'disconnected' })
      }
    })

    ws.on('error', (err) => {
      clearTimeout(helloTimer)
      emit({ type: 'status', state: 'error', message: err?.message || '连接错误' })
    })
  }

  function disconnect() {
    manualClosed = true
    sessionId = null
    serverAudioParams = null
    if (ws) {
      try { ws.close() } catch { /* noop */ }
      ws = null
    }
  }

  function startListen(mode = 'auto') {
    return sendJson({ session_id: sessionId, type: 'listen', state: 'start', mode })
  }

  function stopListen() {
    return sendJson({ session_id: sessionId, type: 'listen', state: 'stop' })
  }

  // 文字对话(M2 核心):detect 模式注入文本,服务端走完整 LLM→TTS,无需音频
  function sendText(text) {
    return sendJson({ session_id: sessionId, type: 'listen', state: 'detect', text })
  }

  // 打断小智说话
  function abort() {
    return sendJson({ session_id: sessionId, type: 'abort', reason: 'user_interrupted' })
  }

  // 上行 Opus 音频帧(M5 用)
  function sendAudio(opusFrame) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(opusFrame)
    return true
  }

  return {
    connect,
    disconnect,
    startListen,
    stopListen,
    sendText,
    abort,
    sendAudio,
    get isConnected() {
      return Boolean(ws && ws.readyState === WebSocket.OPEN && helloReceived)
    },
    get serverAudioParams() {
      return serverAudioParams
    }
  }
}

module.exports = { createXiaozhiClient }
