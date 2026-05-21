const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadActivityLog() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/utils/activityLog.mjs'))
  return import(moduleUrl.href)
}

test('appendActivityLog stores structured reminder response data', async () => {
  const { appendActivityLog } = await loadActivityLog()
  const config = {}

  const entry = appendActivityLog(config, {
    type: 'reminder-response',
    reminderType: 'water',
    result: 'done',
    createdAt: '2026-05-20T10:00:00.000Z'
  })

  assert.equal(config.activityLog.length, 1)
  assert.equal(entry.type, 'reminder-response')
  assert.equal(entry.reminderType, 'water')
  assert.equal(entry.result, 'done')
  assert.ok(entry.id)
})

test('appendActivityLog caps retained activity log entries', async () => {
  const { appendActivityLog } = await loadActivityLog()
  const config = { activityLog: Array.from({ length: 501 }, (_, index) => ({ id: String(index) })) }

  appendActivityLog(config, { type: 'work-stop', createdAt: '2026-05-20T18:30:00.000Z' })

  assert.equal(config.activityLog.length, 500)
  assert.equal(config.activityLog.at(-1).type, 'work-stop')
})
