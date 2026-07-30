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

  // F7:今天非工作日(周末/节假日)时提示休息,不计薪资。
  // 调用方根据节假日数据判断后传入 isWorkday;不传视为工作日(兼容旧行为)。
  if (options.isWorkday === false) {
    return {
      mode: 'rest',
      statusText: '今天休息',
      countdownText: '好好放松一下',
      earnedText: '¥0.00',
      showStopButton: false,
      dayKey: dayKey(now)
    }
  }

  const start = todayFromTime(now, clockIn)
  const end = todayFromTime(now, clockOut)
  const overnight = end <= start // 夜班:下班时间 ≤ 上班时间(跨越午夜)
  // F7:夜班时 totalMs = end - start 为负,补一天得到正确工时
  let totalMs = end - start
  if (totalMs <= 0) totalMs += 24 * 60 * 60 * 1000
  const days = parseFloat(workDays) || 22
  const dailySalary = parseFloat(monthlySalary) / days

  // 判断 now 处于哪个区间。白班与夜班的"上班中/已下班"边界不同:
  //  - 白班:上班中 = [start, end);已下班 = now ≥ end;未上班 = now < start
  //  - 夜班:上班中 = now ≥ start 或 now < end(跨越午夜);已下班 = [end, start)
  //             夜班不存在"未上班"态(now < start 算上班中)
  let phase // 'before' | 'working' | 'after'
  if (overnight) {
    phase = (now >= start || now < end) ? 'working' : 'after'
  } else {
    if (now < start) phase = 'before'
    else if (now < end) phase = 'working'
    else phase = 'after'
  }

  if (phase === 'before') {
    return {
      mode: 'before',
      statusText: '还没上班呢',
      countdownText: formatDuration(start - now),
      earnedText: '¥0.00',
      showStopButton: false
    }
  }

  if (phase === 'working') {
    // 夜班跨午夜时,elapsed 需处理"now 在午夜后"的情况(now < start,实际从昨日 start 起算)
    const elapsedMs = overnight && now < start
      ? (totalMs - (end - now))   // 已工作 = 总工时 - 距下班剩余
      : (now - start)
    const perMs = dailySalary / totalMs
    return {
      mode: 'working',
      statusText: '搬砖中...',
      countdownText: formatDuration(end - now),
      earnedText: `¥${(elapsedMs * perMs).toFixed(2)}`,
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
