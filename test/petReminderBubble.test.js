const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadBubbleBehavior() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/widgets/petReminderBubble.mjs'))
  return import(moduleUrl.href)
}

test('confirmable reminder bubbles stay visible for one minute by default', async () => {
  const { CONFIRMABLE_BUBBLE_DURATION_MS, getReminderBubbleDuration } = await loadBubbleBehavior()

  assert.equal(CONFIRMABLE_BUBBLE_DURATION_MS, 60 * 1000)
  assert.equal(getReminderBubbleDuration({ confirmable: true }), 60 * 1000)
  assert.equal(getReminderBubbleDuration({ confirmable: false }), 5000)
})

test('createReminderResponseEvent records done skipped and timeout results', async () => {
  const { createReminderResponseEvent } = await loadBubbleBehavior()
  const reminderEvent = {
    type: 'water',
    text: '该喝点水啦'
  }

  const event = createReminderResponseEvent(reminderEvent, 'timeout', '2026-05-21T09:30:00.000Z')

  assert.deepEqual(event, {
    type: 'reminder-response',
    reminderType: 'water',
    result: 'timeout',
    reminderText: '该喝点水啦',
    createdAt: '2026-05-21T09:30:00.000Z'
  })
})
