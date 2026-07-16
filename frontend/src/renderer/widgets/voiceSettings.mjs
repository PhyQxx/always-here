// Voice / 小智对话 设置的归一化与默认值
// 与 petChatter.mjs 同一模式:纯逻辑,无 DOM,供 config.js 与 settings.js 复用

export const DEFAULT_VOICE_SETTINGS = {
  enabled: false,
  // 小智服务端 WebSocket 地址(自建默认本地 8000 端口,与 xiaozhi-server config.yaml 一致)
  // 用 127.0.0.1 而非 localhost,避免某些环境把 localhost 解析成 IPv6 ::1 导致连接被拒
  serverUrl: 'ws://127.0.0.1:8000/xiaozhi/v1/',
  deviceId: '', // 空则由 config.js 首次启动生成持久 UUID
  clientId: '', // 同上
  token: '', // 自建服务端 auth 关闭时留空
  triggerKey: 'CommandOrControl+Shift+Space', // 全局快捷键唤醒
  autoPlayTTS: true, // 自动播放小智回复语音(M4 起生效)
  bubbleDurationMs: 8000, // 语音回复气泡停留时长
  ttsVoice: '冰糖' // TTS 音色(MiMo 预置音色),通过 WS 查询参数下发给服务端
}

function boolValue(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function stringValue(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeWsUrl(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return DEFAULT_VOICE_SETTINGS.serverUrl
  // 统一以 / 结尾,与服务端约定路径 /xiaozhi/v1/ 对齐
  return trimmed.endsWith('/') ? trimmed : trimmed + '/'
}

export function normalizeVoiceSettings(input = {}) {
  return {
    enabled: boolValue(input.enabled, DEFAULT_VOICE_SETTINGS.enabled),
    serverUrl: normalizeWsUrl(input.serverUrl),
    deviceId: stringValue(input.deviceId, ''),
    clientId: stringValue(input.clientId, ''),
    token: typeof input.token === 'string' ? input.token.trim() : '',
    triggerKey: stringValue(input.triggerKey, DEFAULT_VOICE_SETTINGS.triggerKey),
    autoPlayTTS: boolValue(input.autoPlayTTS, DEFAULT_VOICE_SETTINGS.autoPlayTTS),
    bubbleDurationMs: Number.isFinite(input.bubbleDurationMs)
      ? Math.max(2000, Math.round(input.bubbleDurationMs))
      : DEFAULT_VOICE_SETTINGS.bubbleDurationMs,
    ttsVoice: stringValue(input.ttsVoice, DEFAULT_VOICE_SETTINGS.ttsVoice)
  }
}

// ── 看屏幕说话(视觉)设置 ──
export const DEFAULT_VISION_SETTINGS = {
  enabled: false,             // 隐私敏感,默认关
  autoIntervalSeconds: 0      // 0=关闭定时看屏幕(单位:秒)
}

export function normalizeVisionSettings(input = {}) {
  return {
    enabled: boolValue(input.enabled, DEFAULT_VISION_SETTINGS.enabled),
    autoIntervalSeconds: Number.isFinite(input.autoIntervalSeconds)
      ? Math.max(0, Math.round(input.autoIntervalSeconds))
      : DEFAULT_VISION_SETTINGS.autoIntervalSeconds
  }
}
