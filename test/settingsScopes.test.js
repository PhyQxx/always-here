const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadSettingsScopes() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/settingsScopes.mjs'))
  return import(moduleUrl.href)
}

test('settings mode titles distinguish global settings from widget settings', async () => {
  const { getSettingsTitle, getSettingsModeSummary } = await loadSettingsScopes()

  assert.equal(getSettingsTitle({ type: 'global' }), '设置')
  assert.equal(getSettingsTitle({ type: 'widget', widgetKey: 'pet' }), '宠物设置')
  assert.equal(getSettingsTitle({ type: 'widget', widgetKey: 'wageman' }), '打工倒计时设置')
  assert.equal(getSettingsModeSummary({ type: 'global' }), '全局设置')
  assert.equal(getSettingsModeSummary({ type: 'widget', widgetKey: 'note' }), '正在编辑：便签')
})

test('global settings mode shows every settings row', async () => {
  const { isSettingsRowVisible } = await loadSettingsScopes()

  assert.equal(isSettingsRowVisible('global', { type: 'global' }), true)
  assert.equal(isSettingsRowVisible('pet', { type: 'global' }), true)
  assert.equal(isSettingsRowVisible('clock', { type: 'global' }), true)
})

test('widget settings mode only shows always rows and matching widget rows', async () => {
  const { isSettingsRowVisible } = await loadSettingsScopes()
  const mode = { type: 'widget', widgetKey: 'pet' }

  assert.equal(isSettingsRowVisible('always', mode), true)
  assert.equal(isSettingsRowVisible('pet', mode), true)
  assert.equal(isSettingsRowVisible('pet wageman', mode), true)
  assert.equal(isSettingsRowVisible('clock', mode), false)
  assert.equal(isSettingsRowVisible('global', mode), false)
  assert.equal(isSettingsRowVisible('', mode), false)
})
