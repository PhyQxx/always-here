export function formatDuration(ms) {
  if (ms <= 0) return '00:00:00'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function dayKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayFromTime(now, timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(now)
  d.setHours(h, m, 0, 0)
  return d
}

export function getWagemanState(options) {
  const now = options.now || new Date()
  const { clockIn, clockOut, monthlySalary, workDays } = options
  if (!clockIn || !clockOut || !monthlySalary) {
    return { mode: 'missing', showStopButton: false, countdownText: '--:--:--', earnedText: '¥0.00' }
  }

  const start = todayFromTime(now, clockIn)
  const end = todayFromTime(now, clockOut)
  const totalMs = end - start
  const days = parseFloat(workDays) || 22
  const dailySalary = parseFloat(monthlySalary) / days

  if (now < start) {
    return {
      mode: 'before',
      statusText: '还没上班呢',
      countdownText: formatDuration(start - now),
      earnedText: '¥0.00',
      showStopButton: false
    }
  }

  if (now < end) {
    const elapsed = now - start
    const perMs = dailySalary / totalMs
    return {
      mode: 'working',
      statusText: '搬砖中...',
      countdownText: formatDuration(end - now),
      earnedText: `¥${(elapsed * perMs).toFixed(2)}`,
      showStopButton: false
    }
  }

  const today = dayKey(now)
  const stoppedAt = options.offWorkStops?.[today]
  const stopTime = stoppedAt ? new Date(stoppedAt) : now
  const overtimeMs = Math.max(0, stopTime - end)
  const stopped = Boolean(stoppedAt)

  return {
    mode: stopped ? 'stopped' : 'overtime',
    statusText: stopped ? '已下班' : '加班中...',
    countdownText: `已加班 ${formatDuration(overtimeMs)}`,
    earnedText: `¥${dailySalary.toFixed(2)}`,
    overtimeMs,
    dayKey: today,
    showStopButton: !stopped
  }
}
