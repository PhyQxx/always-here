const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadHappiness() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/widgets/petHappiness.mjs'))
  return import(moduleUrl.href)
}

test('calculateHappiness adds happiness for chat interaction', async () => {
  const { calculateHappiness } = await loadHappiness()
  const next = calculateHappiness(70, { type: 'chat' })
  assert.ok(next > 70, 'chat should increase happiness')
})

test('calculateHappiness adds happiness for interact event', async () => {
  const { calculateHappiness } = await loadHappiness()
  const next = calculateHappiness(70, { type: 'interact' })
  assert.ok(next > 70, 'interact should increase happiness')
})

test('calculateHappiness clamps to [0, 100]', async () => {
  const { calculateHappiness } = await loadHappiness()
  assert.equal(calculateHappiness(99, { type: 'pomodoro-done' }), 100)
  assert.equal(calculateHappiness(1, { type: 'reminder-response', result: 'timeout' }), 0)
})

test('applyHappinessDecay returns unchanged within grace period', async () => {
  const { applyHappinessDecay } = await loadHappiness()
  const now = Date.now()
  // 24 小时前互动,在 48 小时宽限期内,不衰减
  const result = applyHappinessDecay(80, now - 24 * 3600000, now)
  assert.equal(result.happiness, 80)
  assert.equal(result.decayed, 0)
})

test('applyHappinessDecay reduces happiness after long inactivity', async () => {
  const { applyHappinessDecay } = await loadHappiness()
  const now = Date.now()
  // 4 天前互动 = 48h 宽限 + 48h 衰减期 = 2 个 24h 区间,衰减 4 点
  const result = applyHappinessDecay(80, now - 4 * 24 * 3600000, now)
  assert.ok(result.decayed > 0, 'should decay after long inactivity')
  assert.ok(result.happiness < 80, 'happiness should drop')
  assert.equal(result.happiness, 80 - result.decayed)
})

test('applyHappinessDecay never goes below 0', async () => {
  const { applyHappinessDecay } = await loadHappiness()
  const now = Date.now()
  // 30 天前互动,从 5 起算,衰减远超 5,但不应为负
  const result = applyHappinessDecay(5, now - 30 * 24 * 3600000, now)
  assert.ok(result.happiness >= 0)
})
