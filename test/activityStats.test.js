const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadActivityStats() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/utils/activityStats.mjs'))
  return import(moduleUrl.href)
}

test('summarizeActivityLog counts reminder responses and work stops', async () => {
  const { summarizeActivityLog } = await loadActivityStats()
  const log = [
    { type: 'reminder-response', reminderType: 'water', result: 'done', createdAt: '2026-05-21T09:00:00.000Z' },
    { type: 'reminder-response', reminderType: 'water', result: 'timeout', createdAt: '2026-05-21T09:30:00.000Z' },
    { type: 'reminder-response', reminderType: 'sedentary', result: 'skipped', createdAt: '2026-05-21T10:00:00.000Z' },
    { type: 'work-stop', overtimeMs: 25 * 60 * 1000, createdAt: '2026-05-21T18:25:00.000Z' }
  ]

  const stats = summarizeActivityLog(log)

  assert.equal(stats.total, 4)
  assert.deepEqual(stats.reminders.water, { done: 1, skipped: 0, timeout: 1, total: 2 })
  assert.deepEqual(stats.reminders.sedentary, { done: 0, skipped: 1, timeout: 0, total: 1 })
  assert.equal(stats.workStops, 1)
  assert.equal(stats.totalOvertimeMs, 25 * 60 * 1000)
})

test('buildActivityAnalysis returns local Chinese suggestions from activity patterns', async () => {
  const { buildActivityAnalysis } = await loadActivityStats()
  const log = [
    { type: 'reminder-response', reminderType: 'water', result: 'timeout', createdAt: '2026-05-21T09:00:00.000Z' },
    { type: 'reminder-response', reminderType: 'water', result: 'skipped', createdAt: '2026-05-21T09:30:00.000Z' },
    { type: 'reminder-response', reminderType: 'sedentary', result: 'done', createdAt: '2026-05-21T10:00:00.000Z' }
  ]

  const analysis = buildActivityAnalysis(log)

  assert.match(analysis, /喝水/)
  assert.match(analysis, /久坐/)
  assert.match(analysis, /本地规则分析/)
})
