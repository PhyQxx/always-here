import { appendActivityLog } from '../utils/activityLog.mjs'
import { dayKey, getWagemanState } from './wagemanState.mjs'
import { mergeWagemanConfig } from './wagemanDefaults.mjs'
import { PET_EVENTS } from '../utils/events.mjs'

let getConfigFn = null
let saveConfigFn = null
let updateInterval = null
let domRefs = {}

// F7:今天是否工作日的缓存(避免每秒 updateWageman 都查节假日接口)。
// null=未知(按周一~周五兜底),true/false=已用节假日数据判定。
let todayIsWorkday = null
// G2:节假日数据是否成功获取。失败时降级为周一~周五,需向用户说明判断不可靠。
let holidayDataAvailable = true

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

// F7:根据节假日数据判断"今天"是否工作日。
// info.holiday===true 表示法定假/调休放假;===false 表示周末调休补班。
// 接口失败时按周一~周五兜底,并记录 holidayDataAvailable=false 供 UI 提示。
async function checkTodayWorkday(now = new Date()) {
  const month = now.getMonth() // 0-based
  const key = `${month + 1}-${now.getDate()}`
  try {
    const data = await window.alwaysHere.fetchHolidays(now.getFullYear())
    if (data && data.holiday) {
      holidayDataAvailable = true
      // 今天在节假日字典里:按 holiday 字段判定(假/调休补班)
      if (data.holiday[key]) {
        todayIsWorkday = !data.holiday[key].holiday
        return
      }
      // 今天不在字典里:普通日子,按星期判定
      const dow = now.getDay()
      todayIsWorkday = dow !== 0 && dow !== 6
      return
    }
    // 接口返回但无 holiday 字段,视为数据不可用
    holidayDataAvailable = false
  } catch {
    // 接口抛错,视为数据不可用
    holidayDataAvailable = false
  }
  const dow = now.getDay()
  todayIsWorkday = dow !== 0 && dow !== 6
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
    offWorkStops: wc.offWorkStops || {},
    isWorkday: todayIsWorkday
  })

  const today = dayKey(now)
  const startEvent = config.activityLog?.find(e => e.type === 'work-start' && e.dayKey === today)
  const workStarted = startEvent ? new Date(startEvent.createdAt) : null
  const workStopped = wc.offWorkStops[today]

  startBtn.classList.toggle('hidden', !!workStarted)
  stopBtn.classList.toggle('hidden', !workStarted || !!workStopped)

  if (state.mode === 'missing') {
    statusEl.textContent = '请先设置上班信息'
  } else if (state.mode === 'rest' && !workStarted) {
    // F7:今天非工作日且尚未手动开始上班 → 提示休息
    statusEl.textContent = '今天休息'
    countdownEl.textContent = '好好放松一下'
    earnedEl.textContent = state.earnedText
    return
  } else if (workStopped) {
    statusEl.textContent = '今日已收工'
  } else if (!workStarted) {
    statusEl.textContent = '还没上班呢'
  } else {
    statusEl.textContent = state.statusText
  }

  countdownEl.textContent = workStopped ? '明天见！' : state.countdownText
  earnedEl.textContent = state.earnedText

  // G2:节假日数据获取失败时,在状态后标注,提醒用户"工作日判断不可靠"
  if (!holidayDataAvailable && state.mode !== 'missing' && state.mode !== 'rest') {
    statusEl.title = '未能获取节假日数据,按周一至周五判断工作日(法定节假日可能误判)'
  } else {
    statusEl.title = ''
  }

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
    window.dispatchEvent(new CustomEvent(PET_EVENTS.WAGEMAN_WORKDAYS_AUTOFILLED, {
      detail: { workDays: wc.workDays, label }
    }))
  }

  // F7:初始化时判定今天是否工作日,用于"今天休息"提示。
  // 每天 0 点重判一次(跨天/节假日切换)。
  await checkTodayWorkday()
  let lastWorkdayCheckDay = new Date().getDate()
  setInterval(() => {
    const today = new Date().getDate()
    if (today !== lastWorkdayCheckDay) {
      lastWorkdayCheckDay = today
      checkTodayWorkday()
    }
  }, 60 * 1000)

  const stopBtn = document.getElementById('wageman-stop')
  const startBtn = document.getElementById('wageman-start')

  window.addEventListener(PET_EVENTS.WAGEMAN_SETTINGS_CHANGED, () => {
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
      offWorkStops: wc.offWorkStops || {},
      isWorkday: todayIsWorkday
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
    
    window.dispatchEvent(new CustomEvent(PET_EVENTS.WORK_STOP, { detail: entry }))
  })

  ;[stopBtn, startBtn].forEach(el => {
    el.addEventListener('mousedown', (e) => e.stopPropagation())
  })

  updateWageman()
  updateInterval = setInterval(updateWageman, 1000)
}
