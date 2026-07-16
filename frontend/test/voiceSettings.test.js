const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadVoiceSettings() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/widgets/voiceSettings.mjs'))
  return import(moduleUrl.href)
}

test('normalizeVoiceSettings fills defaults and normalizes the ws url', async () => {
  const { normalizeVoiceSettings, DEFAULT_VOICE_SETTINGS } = await loadVoiceSettings()

  const empty = normalizeVoiceSettings({})
  assert.equal(empty.enabled, DEFAULT_VOICE_SETTINGS.enabled)
  assert.equal(empty.serverUrl, DEFAULT_VOICE_SETTINGS.serverUrl)
  assert.equal(empty.autoPlayTTS, DEFAULT_VOICE_SETTINGS.autoPlayTTS)
  assert.equal(empty.bubbleDurationMs, DEFAULT_VOICE_SETTINGS.bubbleDurationMs)
  // 缺省 device-id / client-id 留空,由主进程首次启动生成
  assert.equal(empty.deviceId, '')
  assert.equal(empty.clientId, '')
})

test('normalizeVoiceSettings ensures server url ends with a trailing slash', async () => {
  const { normalizeVoiceSettings } = await loadVoiceSettings()
  assert.equal(normalizeVoiceSettings({ serverUrl: 'ws://x:8000/xiaozhi/v1' }).serverUrl, 'ws://x:8000/xiaozhi/v1/')
  assert.equal(normalizeVoiceSettings({ serverUrl: 'ws://x:8000/xiaozhi/v1/' }).serverUrl, 'ws://x:8000/xiaozhi/v1/')
  // 空 url 回落到默认
  assert.equal(normalizeVoiceSettings({ serverUrl: '   ' }).serverUrl.includes('/xiaozhi/v1/'), true)
})

test('normalizeVoiceSettings trims token and clamps bubble duration', async () => {
  const { normalizeVoiceSettings } = await loadVoiceSettings()
  assert.equal(normalizeVoiceSettings({ token: '  abc  ' }).token, 'abc')
  // 过小值夹到下限 2000
  assert.equal(normalizeVoiceSettings({ bubbleDurationMs: 100 }).bubbleDurationMs, 2000)
  // 非数字回落默认
  assert.equal(normalizeVoiceSettings({ bubbleDurationMs: 'oops' }).bubbleDurationMs, 8000)
})

test('normalizeVoiceSettings preserves a configured trigger key', async () => {
  const { normalizeVoiceSettings } = await loadVoiceSettings()
  assert.equal(
    normalizeVoiceSettings({ triggerKey: 'CommandOrControl+Alt+V' }).triggerKey,
    'CommandOrControl+Alt+V'
  )
  // 空值回落默认快捷键
  assert.equal(normalizeVoiceSettings({ triggerKey: '' }).triggerKey, 'CommandOrControl+Shift+Space')
})
