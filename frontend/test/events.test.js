const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadEvents() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/utils/events.mjs'))
  return import(moduleUrl.href)
}

test('PET_EVENTS contains the documented kebab-case event names', async () => {
  const { PET_EVENTS } = await loadEvents()

  // 事件名必须是 kebab-case 字符串,与派发/监听处一致
  assert.equal(PET_EVENTS.POMODORO_START, 'pomodoro-start')
  assert.equal(PET_EVENTS.POMODORO_STOP, 'pomodoro-stop')
  assert.equal(PET_EVENTS.POMODORO_DONE, 'pomodoro-done')
  assert.equal(PET_EVENTS.WORK_STOP, 'work-stop')
  assert.equal(PET_EVENTS.PET_VOICE_REPLY, 'pet-voice-reply')
  assert.equal(PET_EVENTS.WIDGET_DRAG, 'widget-drag')
  assert.equal(PET_EVENTS.TRAY_COMMAND, 'tray-command')
  assert.equal(PET_EVENTS.WIDGETS_VISIBILITY_CHANGED, 'widgets-visibility-changed')
})

test('PET_EVENTS values are unique (no accidental aliasing)', async () => {
  const { PET_EVENTS } = await loadEvents()
  const values = Object.values(PET_EVENTS)
  assert.equal(new Set(values).size, values.length, 'event names must be unique')
})

test('PET_EVENTS is frozen (prevents accidental mutation)', async () => {
  const { PET_EVENTS } = await loadEvents()
  assert.equal(Object.isFrozen(PET_EVENTS), true)
})
