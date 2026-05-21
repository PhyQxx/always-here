const REMINDER_TYPES = ['water', 'sedentary']
const RESULT_TYPES = ['done', 'skipped', 'timeout']

function emptyReminderStats() {
  return { done: 0, skipped: 0, timeout: 0, total: 0 }
}

function parseTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function timeOnSameDay(base, time) {
  if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) return null
  const [hours, minutes] = time.split(':').map(Number)
  const date = new Date(base)
  date.setHours(hours, minutes, 0, 0)
  return date
}

function getWorkStopOvertimeMs(entry) {
  if (Number.isFinite(entry.overtimeMs)) return Math.max(0, entry.overtimeMs)
  const stoppedAt = parseTime(entry.stoppedAt || entry.createdAt)
  const clockOut = timeOnSameDay(stoppedAt || new Date(), entry.clockOut)
  if (!stoppedAt || !clockOut) return 0
  return Math.max(0, stoppedAt - clockOut)
}

export function formatDuration(ms) {
  const safeMs = Math.max(0, Number(ms) || 0)
  const totalMinutes = Math.floor(safeMs / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}小时${minutes}分钟`
  return `${minutes}分钟`
}

export function summarizeActivityLog(log = []) {
  const reminders = {
    water: emptyReminderStats(),
    sedentary: emptyReminderStats()
  }
  let workStops = 0
  let totalOvertimeMs = 0

  for (const entry of Array.isArray(log) ? log : []) {
    if (entry.type === 'reminder-response' && REMINDER_TYPES.includes(entry.reminderType)) {
      const stats = reminders[entry.reminderType]
      if (RESULT_TYPES.includes(entry.result)) stats[entry.result] += 1
      stats.total += 1
    }
    if (entry.type === 'work-stop') {
      workStops += 1
      totalOvertimeMs += getWorkStopOvertimeMs(entry)
    }
  }

  return {
    total: Array.isArray(log) ? log.length : 0,
    reminders,
    workStops,
    totalOvertimeMs
  }
}

export function buildActivityAnalysis(log = []) {
  const stats = summarizeActivityLog(log)
  if (!stats.total) return 'AI分析（本地规则分析）：暂时还没有记录，先让提醒运行一阵。'

  const parts = []
  const water = stats.reminders.water
  const sedentary = stats.reminders.sedentary
  const waterMissed = water.skipped + water.timeout
  const sedentaryMissed = sedentary.skipped + sedentary.timeout

  if (water.total) {
    parts.push(waterMissed > water.done
      ? '喝水提醒经常没有确认，建议把间隔调短一点，或者打开系统通知。'
      : '喝水记录整体还不错，继续保持。')
  } else {
    parts.push('喝水还没有操作记录。')
  }

  if (sedentary.total) {
    parts.push(sedentaryMissed > sedentary.done
      ? '久坐提醒有漏确认，工作中可以试试每小时站起来活动一次。'
      : '久坐提醒响应稳定，身体会感谢你的。')
  } else {
    parts.push('久坐还没有操作记录。')
  }

  if (stats.workStops) {
    parts.push(`下班记录 ${stats.workStops} 次，累计加班 ${formatDuration(stats.totalOvertimeMs)}。`)
  }

  return `AI分析（本地规则分析）：${parts.join(' ')}`
}

export function formatActivityEntry(entry) {
  const date = parseTime(entry.createdAt)
  const time = date ? date.toLocaleString('zh-CN', { hour12: false }) : '未知时间'
  if (entry.type === 'reminder-response') {
    const reminderName = entry.reminderType === 'water' ? '喝水' : entry.reminderType === 'sedentary' ? '久坐' : entry.reminderType
    const resultName = entry.result === 'done' ? '做了' : entry.result === 'skipped' ? '没做' : '超时未确认'
    return `${time} · ${reminderName}提醒 · ${resultName}`
  }
  if (entry.type === 'work-stop') {
    return `${time} · 下班 · 加班 ${formatDuration(getWorkStopOvertimeMs(entry))}`
  }
  return `${time} · ${entry.type || '记录'}`
}
