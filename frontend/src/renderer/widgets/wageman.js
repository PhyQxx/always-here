import { appendActivityLog } from '../utils/activityLog.mjs'
import { dayKey, getWagemanState } from './wagemanState.mjs'
import { mergeWagemanConfig } from './wagemanDefaults.mjs'

let getConfigFn = null
let saveConfigFn = null
let updateInterval = null
let domRefs = {}

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
  const { countdownEl, earnedEl, statusEl, stopBtn, startBtn, actualDurEl, expectedDurEl } = domRefs

  const now = new Date()
  const state = getWagemanState({
    now,
    clockIn,
    clockOut,
    monthlySalary,
    workDays,
    offWorkStops: wc.offWorkStops || {}
  })

  const today = dayKey(now)
  const startEvent = config.activityLog?.find(e => e.type === 'work-start' && e.dayKey === today)
  const workStarted = startEvent ? new Date(startEvent.createdAt) : null
  const workStopped = wc.offWorkStops[today]

  startBtn.classList.toggle('hidden', !!workStarted)
  stopBtn.classList.toggle('hidden', !workStarted || !!workStopped)

  if (state.mode === 'missing') {
    statusEl.textContent = '请先设置上班信息'
  } else if (workStopped) {
    statusEl.textContent = '今日已收工'
  } else if (!workStarted) {
    statusEl.textContent = '还没上班呢'
  } else {
    statusEl.textContent = state.statusText
  }

  countdownEl.textContent = workStopped ? '明天见！' : state.countdownText
  earnedEl.textContent = state.earnedText

  // Update Durations
  if (actualDurEl && expectedDurEl && clockIn && clockOut) {
    const [inH, inM] = clockIn.split(':').map(Number)
    const [outH, outM] = clockOut.split(':').map(Number)
    let expMs = (outH * 60 + outM - (inH * 60 + inM)) * 60000
    if (expMs < 0) expMs += 24 * 3600000
    
    const expH = Math.floor(expMs / 3600000)
    const expM = Math.round((expMs % 3600000) / 60000)
    expectedDurEl.textContent = `${expH}h ${expM}m`

    let actMs = 0
    if (workStarted) {
      const end = workStopped ? new Date(workStopped) : now
      actMs = end - workStarted
    }
    const actH = Math.floor(actMs / 3600000)
    const actM = Math.round((actMs % 3600000) / 60000)
    actualDurEl.textContent = `${actH}h ${actM}m`
  }
}

export async function initWageman(getConfig, saveConfig) {
  getConfigFn = getConfig
  saveConfigFn = saveConfig

  domRefs = {
    countdownEl: document.getElementById('wageman-countdown'),
    earnedEl: document.getElementById('wageman-earned'),
    statusEl: document.getElementById('wageman-status'),
    stopBtn: document.getElementById('wageman-stop'),
    startBtn: document.getElementById('wageman-start'),
    actualDurEl: document.getElementById('wageman-duration-actual'),
    expectedDurEl: document.getElementById('wageman-duration-expected')
  }

  const config = getConfig()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  config.wageman = mergeWagemanConfig(config.wageman)
  const wc = config.wageman
  if (!wc.offWorkStops) wc.offWorkStops = {}

  if (wc.workDaysAuto !== false) {
    const holidayDays = await fetchHolidayWorkdays(year, month)
    let label = ''
    if (holidayDays !== null) {
      wc.workDays = String(holidayDays)
      label = `工作日 (${month + 1}月, 含调休)`
    } else {
      wc.workDays = String(countWorkdays(year, month))
      label = `工作日 (${month + 1}月, 未含节假日)`
    }
    saveConfig()
    window.dispatchEvent(new CustomEvent('wageman-workdays-autofilled', {
      detail: { workDays: wc.workDays, label }
    }))
  }

  const stopBtn = document.getElementById('wageman-stop')
  const startBtn = document.getElementById('wageman-start')

  window.addEventListener('wageman-settings-changed', () => {
    updateWageman()
  })

  startBtn.addEventListener('click', async (e) => {
    e.stopPropagation()
    const now = new Date()
    const today = dayKey(now)
    appendActivityLog(config, {
      type: 'work-start',
      dayKey: today,
      createdAt: now.toISOString()
    })
    await saveConfig()
    updateWageman()
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
    const entry = {
      type: 'work-stop',
      result: 'done',
      dayKey: today,
      clockIn: wc.clockIn,
      clockOut: wc.clockOut,
      stoppedAt: wc.offWorkStops[today],
      overtimeMs: state.overtimeMs || 0,
      createdAt: wc.offWorkStops[today]
    }
    appendActivityLog(config, entry)
    await saveConfig()
    updateWageman()
    
    window.dispatchEvent(new CustomEvent('work-stop', { detail: entry }))
  })

  ;[stopBtn, startBtn].forEach(el => {
    el.addEventListener('mousedown', (e) => e.stopPropagation())
  })

  updateWageman()
  updateInterval = setInterval(updateWageman, 1000)
}
