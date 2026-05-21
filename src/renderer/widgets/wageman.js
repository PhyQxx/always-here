import { appendActivityLog } from '../utils/activityLog.mjs'
import { dayKey, getWagemanState } from './wagemanState.mjs'
import { mergeWagemanConfig } from './wagemanDefaults.mjs'

let getConfigFn = null
let saveConfigFn = null
let updateInterval = null
let saveTimeout = null

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function todayFromTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

function countWorkdays(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let count = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

async function fetchHolidayWorkdays(year, month) {
  try {
    const data = await window.alwaysHere.fetchHolidays(year)
    if (!data || !data.holiday) return null
    const holidays = data.holiday
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    let count = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${month + 1}-${d}`
      const info = holidays[key]
      if (info) {
        // info.holiday=true → 休息日; info.holiday=false → 调休上班
        if (!info.holiday) count++
      } else {
        const dow = new Date(year, month, d).getDay()
        if (dow !== 0 && dow !== 6) count++
      }
    }
    return count
  } catch {
    return null
  }
}

function updateWageman() {
  const config = getConfigFn()
  const wc = config.wageman || {}
  const { clockIn, clockOut, monthlySalary, workDays } = wc
  const countdownEl = document.getElementById('wageman-countdown')
  const earnedEl = document.getElementById('wageman-earned')
  const statusEl = document.getElementById('wageman-status')
  const stopBtn = document.getElementById('wageman-stop')

  const state = getWagemanState({
    now: new Date(),
    clockIn,
    clockOut,
    monthlySalary,
    workDays,
    offWorkStops: wc.offWorkStops || {}
  })

  if (state.mode === 'missing') {
    statusEl.textContent = '请先设置上班信息'
  } else {
    statusEl.textContent = state.statusText
  }
  countdownEl.textContent = state.countdownText
  earnedEl.textContent = state.earnedText
  stopBtn.classList.toggle('hidden', !state.showStopButton)
}

export async function initWageman(getConfig, saveConfig) {
  getConfigFn = getConfig
  saveConfigFn = saveConfig

  const config = getConfig()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  config.wageman = mergeWagemanConfig(config.wageman)

  const wc = config.wageman
  if (!wc.offWorkStops) wc.offWorkStops = {}
  const workDaysInput = document.getElementById('wageman-workdays')
  const workDaysLabel = document.getElementById('wageman-workdays-label')

  // Auto-calculate workdays with holiday data
  if (wc.workDaysAuto !== false) {
    workDaysLabel.textContent = '获取中...'
    const holidayDays = await fetchHolidayWorkdays(year, month)
    if (holidayDays !== null) {
      wc.workDays = String(holidayDays)
      workDaysLabel.textContent = `工作日 (${month + 1}月, 含调休)`
    } else {
      wc.workDays = String(countWorkdays(year, month))
      workDaysLabel.textContent = `工作日 (${month + 1}月, 未含节假日)`
    }
    workDaysInput.value = wc.workDays
    saveConfig()
  }

  const clockInInput = document.getElementById('wageman-clockin')
  const clockOutInput = document.getElementById('wageman-clockout')
  const salaryInput = document.getElementById('wageman-salary')
  const toggleBtn = document.getElementById('wageman-toggle')
  const stopBtn = document.getElementById('wageman-stop')
  const inputs = document.getElementById('wageman-inputs')

  clockInInput.value = wc.clockIn
  clockOutInput.value = wc.clockOut
  salaryInput.value = wc.monthlySalary
  if (!workDaysInput.value) workDaysInput.value = wc.workDays || String(countWorkdays(year, month))

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    inputs.classList.toggle('collapsed')
    toggleBtn.textContent = inputs.classList.contains('collapsed') ? '⚙' : '✕'
  })

  const saveInputs = () => {
    wc.clockIn = clockInInput.value
    wc.clockOut = clockOutInput.value
    wc.monthlySalary = salaryInput.value
    wc.workDays = workDaysInput.value
    delete wc.offWorkStops?.[dayKey(new Date())]
    saveConfig()
    updateWageman()
  }

  clockInInput.addEventListener('change', saveInputs)
  clockOutInput.addEventListener('change', saveInputs)
  salaryInput.addEventListener('input', () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(saveInputs, 600)
  })
  // Manual edit of workdays disables auto
  workDaysInput.addEventListener('change', () => {
    wc.workDaysAuto = false
    workDaysLabel.textContent = '工作日 (手动)'
    saveInputs()
  })

  stopBtn.addEventListener('click', async (e) => {
    e.stopPropagation()
    const now = new Date()
    const today = dayKey(now)
    const state = getWagemanState({
      now,
      clockIn: wc.clockIn,
      clockOut: wc.clockOut,
      monthlySalary: wc.monthlySalary,
      workDays: wc.workDays,
      offWorkStops: wc.offWorkStops || {}
    })
    wc.offWorkStops[today] = now.toISOString()
    appendActivityLog(config, {
      type: 'work-stop',
      result: 'done',
      dayKey: today,
      clockIn: wc.clockIn,
      clockOut: wc.clockOut,
      stoppedAt: wc.offWorkStops[today],
      overtimeMs: state.overtimeMs || 0,
      createdAt: wc.offWorkStops[today]
    })
    await saveConfig()
    updateWageman()
  })

  // Prevent drag on interactive elements
  ;[clockInInput, clockOutInput, salaryInput, workDaysInput, toggleBtn, stopBtn].forEach(el => {
    el.addEventListener('mousedown', (e) => e.stopPropagation())
  })

  inputs.classList.add('collapsed')
  updateWageman()
  updateInterval = setInterval(updateWageman, 1000)
}
