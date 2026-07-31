const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadRecap() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/widgets/petDailyRecap.mjs'))
  return import(moduleUrl.href)
}

test('recapDateKey produces YYYY-M-D without zero padding', async () => {
  const { recapDateKey } = await loadRecap()
  const key = recapDateKey(new Date('2026-03-09T10:00:00'))
  assert.equal(key, '2026-3-9')
})

test('shouldShowDailyRecap returns false when already recapped today', async () => {
  const { shouldShowDailyRecap, recapDateKey } = await loadRecap()
  const now = new Date('2026-07-29T21:00:00')
  const config = { lastRecapDate: recapDateKey(now) }
  assert.equal(shouldShowDailyRecap(config, 'work-stop', now), false)
  assert.equal(shouldShowDailyRecap(config, 'scheduled', now), false)
})

test('shouldShowDailyRecap triggers on work-stop regardless of hour', async () => {
  const { shouldShowDailyRecap } = await loadRecap()
  const now = new Date('2026-07-29T09:00:00') // 早上 9 点下班(夜班)
  const config = { lastRecapDate: null }
  assert.equal(shouldShowDailyRecap(config, 'work-stop', now), true)
})

test('shouldShowDailyRecap scheduled trigger only after 20:00', async () => {
  const { shouldShowDailyRecap } = await loadRecap()
  const config = { lastRecapDate: null }
  // 19:00 不触发
  assert.equal(shouldShowDailyRecap(config, 'scheduled', new Date('2026-07-29T19:59:00')), false)
  // 20:00 触发
  assert.equal(shouldShowDailyRecap(config, 'scheduled', new Date('2026-07-29T20:00:00')), true)
})

test('shouldShowDailyRecap ignores unknown triggers', async () => {
  const { shouldShowDailyRecap } = await loadRecap()
  const config = { lastRecapDate: null }
  assert.equal(shouldShowDailyRecap(config, 'something-else', new Date('2026-07-29T22:00:00')), false)
})

test('buildRecapPrompt returns null when no activity today', async () => {
  const { buildRecapPrompt } = await loadRecap()
  const config = { activityLog: [], happiness: 70 }
  assert.equal(buildRecapPrompt(config, new Date('2026-07-29T21:00:00')), null)
})

test('buildRecapPrompt includes pomodoro and water context when present', async () => {
  const { buildRecapPrompt } = await loadRecap()
  const now = new Date('2026-07-29T21:00:00')
  const todayIso = now.toISOString()
  const config = {
    happiness: 75,
    activityLog: [
      { type: 'pomodoro-done', createdAt: todayIso },
      { type: 'pomodoro-done', createdAt: todayIso },
      { type: 'reminder-response', reminderType: 'water', result: 'done', createdAt: todayIso }
    ]
  }
  const prompt = buildRecapPrompt(config, now)
  assert.ok(prompt, 'should return a prompt string')
  assert.match(prompt, /2个番茄钟/)
  assert.match(prompt, /1次喝水/)
})

test('buildLocalRecap returns encouraging message based on activity', async () => {
  const { buildLocalRecap } = await loadRecap()
  const now = new Date('2026-07-29T21:00:00')
  const todayIso = now.toISOString()
  // 空 activityLog → 通用问候
  assert.match(buildLocalRecap({ activityLog: [] }, now), /照顾自己/)
  // 3+ 番茄钟 → 专注相关
  const config = {
    activityLog: [
      { type: 'pomodoro-done', createdAt: todayIso },
      { type: 'pomodoro-done', createdAt: todayIso },
      { type: 'pomodoro-done', createdAt: todayIso }
    ]
  }
  assert.match(buildLocalRecap(config, now), /专注/)
})
