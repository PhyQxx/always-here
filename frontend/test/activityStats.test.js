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

test('activity helpers filter logs summarize recent days and export csv', async () => {
  const {
    exportActivityLogCsv,
    filterActivityLog,
    summarizeRecentDays
  } = await loadActivityStats()
  const log = [
    { type: 'reminder-response', reminderType: 'water', result: 'done', createdAt: '2026-05-21T09:00:00.000Z' },
    { type: 'reminder-response', reminderType: 'water', result: 'timeout', createdAt: '2026-05-20T09:30:00.000Z' },
    { type: 'reminder-response', reminderType: 'sedentary', result: 'skipped', createdAt: '2026-05-14T10:00:00.000Z' },
    { type: 'work-stop', overtimeMs: 25 * 60 * 1000, createdAt: '2026-05-21T18:25:00.000Z' }
  ]

  const waterLog = filterActivityLog(log, { type: 'water', days: 7 }, new Date('2026-05-21T23:00:00.000Z'))
  const recent = summarizeRecentDays(log, 7, new Date('2026-05-21T23:00:00.000Z'))
  const csv = exportActivityLogCsv(waterLog)

  assert.equal(waterLog.length, 2)
  assert.equal(recent.days, 7)
  assert.equal(recent.entries, 3)
  assert.equal(recent.waterDone, 1)
  assert.equal(recent.waterMissed, 1)
  assert.equal(recent.sedentaryMissed, 0)
  assert.match(csv, /^时间,类型,结果,详情/m)
  assert.match(csv, /喝水提醒,完成/)
  assert.doesNotMatch(csv, /久坐提醒/)
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
  assert.match(analysis, /习惯分析/)
  assert.match(analysis, /完成率/)
})
