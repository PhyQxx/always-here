const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadWagemanState() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/widgets/wagemanState.mjs'))
  return import(moduleUrl.href)
}

test('getWagemanState enters overtime after clock-out until stopped', async () => {
  const { getWagemanState } = await loadWagemanState()
  const state = getWagemanState({
    now: new Date('2026-05-20T18:12:30'),
    clockIn: '09:00',
    clockOut: '18:00',
    monthlySalary: '22000',
    workDays: '22',
    offWorkStops: {}
  })

  assert.equal(state.mode, 'overtime')
  assert.equal(state.showStopButton, true)
  assert.equal(state.overtimeMs, 12.5 * 60 * 1000)
})

test('getWagemanState fixes overtime after stop button is clicked', async () => {
  const { getWagemanState } = await loadWagemanState()
  const state = getWagemanState({
    now: new Date('2026-05-20T19:00:00'),
    clockIn: '09:00',
    clockOut: '18:00',
    monthlySalary: '22000',
    workDays: '22',
    offWorkStops: {
      '2026-05-20': '2026-05-20T18:20:00'
    }
  })

  assert.equal(state.mode, 'stopped')
  assert.equal(state.showStopButton, false)
  assert.equal(state.overtimeMs, 20 * 60 * 1000)
})

test('getWagemanState returns rest mode when isWorkday is false', async () => {
  const { getWagemanState } = await loadWagemanState()
  const state = getWagemanState({
    now: new Date('2026-05-23T12:00:00'), // 周六
    clockIn: '09:00',
    clockOut: '18:00',
    monthlySalary: '22000',
    workDays: '22',
    offWorkStops: {},
    isWorkday: false
  })
  assert.equal(state.mode, 'rest')
  assert.equal(state.statusText, '今天休息')
  assert.equal(state.earnedText, '¥0.00')
})

test('getWagemanState handles overnight shift (clockOut < clockIn) without negative total', async () => {
  const { getWagemanState } = await loadWagemanState()
  // 夜班 22:00→06:00,凌晨 3 点应在"工作中"而非加班
  const state = getWagemanState({
    now: new Date('2026-05-20T03:00:00'),
    clockIn: '22:00',
    clockOut: '06:00',
    monthlySalary: '22000',
    workDays: '22',
    offWorkStops: {}
  })
  assert.equal(state.mode, 'working')
  assert.equal(state.statusText, '搬砖中...')
})
