const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function updateClock() {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  document.getElementById('clock-time').textContent = `${h}:${m}:${s}`

  const y = now.getFullYear()
  const mon = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const wd = WEEKDAYS[now.getDay()]
  document.getElementById('clock-date').textContent = `${y}-${mon}-${d} ${wd}`
}

export function initClock() {
  updateClock()
  setInterval(updateClock, 1000)
}
