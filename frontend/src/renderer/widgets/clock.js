const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

let getConfigFn = null
let clockTimer = null

// F9:支持"显示秒"与"24小时制"开关。默认都开(保持旧行为)。
// 不显示秒时,每分钟整分更新一次(节省刷新),其余每秒更新。
function clockSettings() {
  const ws = getConfigFn?.()?.widgets?.clock || {}
  return {
    showSeconds: ws.showSeconds !== false,
    use24h: ws.use24h !== false
  }
}

function formatHourMin(now) {
  const { use24h } = clockSettings()
  let h = now.getHours()
  const m = String(now.getMinutes()).padStart(2, '0')
  if (use24h) {
    return `${String(h).padStart(2, '0')}:${m}`
  }
  // 12 小时制带 AM/PM
  const suffix = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${String(h).padStart(2, '0')}:${m} ${suffix}`
}

function updateClock() {
  const now = new Date()
  const { showSeconds } = clockSettings()
  const timeEl = document.getElementById('clock-time')
  if (!timeEl) return

  if (showSeconds) {
    const s = String(now.getSeconds()).padStart(2, '0')
    timeEl.textContent = `${formatHourMin(now)}:${s}`
  } else {
    timeEl.textContent = formatHourMin(now)
  }

  const dateEl = document.getElementById('clock-date')
  if (dateEl) {
    const y = now.getFullYear()
    const mon = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const wd = WEEKDAYS[now.getDay()]
    dateEl.textContent = `${y}-${mon}-${d} ${wd}`
  }
}

// 计算到下一个整分(或下一秒)的等待时长,实现"不显示秒时只在整分刷新"
function nextTickDelay() {
  if (clockSettings().showSeconds) return 1000
  const now = new Date()
  const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds()
  return Math.max(1000, msToNextMinute)
}

function scheduleClockTick() {
  if (clockTimer) clearTimeout(clockTimer)
  updateClock()
  clockTimer = setTimeout(scheduleClockTick, nextTickDelay())
}

export function initClock(getConfig) {
  getConfigFn = getConfig
  scheduleClockTick()
}
