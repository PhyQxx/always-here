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
