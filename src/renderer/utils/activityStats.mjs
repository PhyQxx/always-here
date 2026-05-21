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

function getRecentStart(days, now = new Date()) {
  const safeDays = Math.max(1, Number(days) || 7)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - safeDays + 1)
  return start
}

function isInRecentRange(entry, days, now) {
  if (!days || days === 'all') return true
  const date = parseTime(entry.createdAt)
  return Boolean(date && date >= getRecentStart(days, now) && date <= now)
}

function isEntryType(entry, type) {
  if (!type || type === 'all') return true
  if (type === 'water' || type === 'sedentary') {
    return entry.type === 'reminder-response' && entry.reminderType === type
  }
  if (type === 'work') return entry.type === 'work-stop'
  return entry.type === type
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

export function filterActivityLog(log = [], filters = {}, now = new Date()) {
  const entries = Array.isArray(log) ? log : []
  return entries.filter(entry => (
    isEntryType(entry, filters.type) &&
    isInRecentRange(entry, filters.days, now)
  ))
}

export function summarizeRecentDays(log = [], days = 7, now = new Date()) {
  const entries = filterActivityLog(log, { days }, now)
  const stats = summarizeActivityLog(entries)
  const waterMissed = stats.reminders.water.skipped + stats.reminders.water.timeout
  const sedentaryMissed = stats.reminders.sedentary.skipped + stats.reminders.sedentary.timeout
  return {
    days: Math.max(1, Number(days) || 7),
    entries: entries.length,
    waterDone: stats.reminders.water.done,
    waterMissed,
    sedentaryDone: stats.reminders.sedentary.done,
    sedentaryMissed,
    workStops: stats.workStops,
    totalOvertimeMs: stats.totalOvertimeMs
  }
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function getActivityEntryFields(entry) {
  const date = parseTime(entry.createdAt)
  const time = date ? date.toLocaleString('zh-CN', { hour12: false }) : ''
  if (entry.type === 'reminder-response') {
    const typeName = entry.reminderType === 'water' ? '喝水提醒' : entry.reminderType === 'sedentary' ? '久坐提醒' : entry.reminderType
    const resultName = entry.result === 'done' ? '完成' : entry.result === 'skipped' ? '跳过' : '超时'
    return [time, typeName, resultName, formatActivityEntry(entry)]
  }
  if (entry.type === 'work-stop') {
    return [time, '下班记录', '已下班', formatActivityEntry(entry)]
  }
  return [time, entry.type || '记录', '', formatActivityEntry(entry)]
}

export function exportActivityLogCsv(log = []) {
  const rows = [['时间', '类型', '结果', '详情']]
  for (const entry of Array.isArray(log) ? log : []) {
    rows.push(getActivityEntryFields(entry))
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\n')
}

export function buildActivityAnalysis(log = []) {
  const stats = summarizeActivityLog(log)
  if (!stats.total) return '习惯分析（本地规则）：暂时还没有记录，先让提醒运行一阵。'

  const parts = []
  const water = stats.reminders.water
  const sedentary = stats.reminders.sedentary
  const waterMissed = water.skipped + water.timeout
  const sedentaryMissed = sedentary.skipped + sedentary.timeout
  const waterRate = water.total ? Math.round((water.done / water.total) * 100) : 0
  const sedentaryRate = sedentary.total ? Math.round((sedentary.done / sedentary.total) * 100) : 0

  if (water.total) {
    parts.push(waterMissed > water.done
      ? `喝水完成率 ${waterRate}%，建议把水杯放到视线内，或者打开系统通知。`
      : `喝水完成率 ${waterRate}%，节奏不错，继续保持。`)
  } else {
    parts.push('喝水还没有操作记录。')
  }

  if (sedentary.total) {
    parts.push(sedentaryMissed > sedentary.done
      ? `久坐活动完成率 ${sedentaryRate}%，建议把提醒间隔设短一点，并在整点站起来 1 分钟。`
      : `久坐活动完成率 ${sedentaryRate}%，身体会感谢你的。`)
  } else {
    parts.push('久坐还没有操作记录。')
  }

  if (stats.workStops) {
    parts.push(stats.totalOvertimeMs > 0
      ? `下班记录 ${stats.workStops} 次，累计加班 ${formatDuration(stats.totalOvertimeMs)}，可以考虑提前 10 分钟做收尾。`
      : `下班记录 ${stats.workStops} 次，没有记录到加班，边界感很好。`)
  }

  return `习惯分析（本地规则）：${parts.join(' ')}`
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
