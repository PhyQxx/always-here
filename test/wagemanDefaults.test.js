const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadWagemanDefaults() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/widgets/wagemanDefaults.mjs'))
  return import(moduleUrl.href)
}

test('default wageman config is 9 to 5 with 8000 monthly salary', async () => {
  const { DEFAULT_WAGEMAN_CONFIG, mergeWagemanConfig } = await loadWagemanDefaults()

  assert.equal(DEFAULT_WAGEMAN_CONFIG.clockIn, '09:00')
  assert.equal(DEFAULT_WAGEMAN_CONFIG.clockOut, '17:00')
  assert.equal(DEFAULT_WAGEMAN_CONFIG.monthlySalary, '8000')

  assert.deepEqual(mergeWagemanConfig({}), {
    clockIn: '09:00',
    clockOut: '17:00',
    monthlySalary: '8000',
    workDays: '',
    workDaysAuto: true,
    offWorkStops: {}
  })
})

test('mergeWagemanConfig keeps existing user values', async () => {
  const { mergeWagemanConfig } = await loadWagemanDefaults()

  const merged = mergeWagemanConfig({
    clockIn: '10:00',
    clockOut: '19:00',
    monthlySalary: '12000',
    offWorkStops: { '2026-05-21': '2026-05-21T19:30:00.000Z' }
  })

  assert.equal(merged.clockIn, '10:00')
  assert.equal(merged.clockOut, '19:00')
  assert.equal(merged.monthlySalary, '12000')
  assert.deepEqual(merged.offWorkStops, { '2026-05-21': '2026-05-21T19:30:00.000Z' })
})

test('mergeWagemanConfig migrates previous implicit defaults to 9 to 5 and 8000', async () => {
  const { mergeWagemanConfig } = await loadWagemanDefaults()

  const merged = mergeWagemanConfig({
    clockIn: '09:00',
    clockOut: '18:00',
    monthlySalary: '',
    workDays: '22'
  })

  assert.equal(merged.clockIn, '09:00')
  assert.equal(merged.clockOut, '17:00')
  assert.equal(merged.monthlySalary, '8000')
  assert.equal(merged.workDays, '22')
})
