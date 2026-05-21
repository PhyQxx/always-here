const MIN_INTERVAL_MINUTES = 1

export const DEFAULT_REMINDERS = {
  hourly: { enabled: true, systemNotification: false },
  water: { enabled: true, intervalMinutes: 30, systemNotification: false },
  sedentary: { enabled: true, intervalMinutes: 60, systemNotification: false },
  work: { enabled: true, systemNotification: false }
}

function boolValue(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function intervalValue(value, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(MIN_INTERVAL_MINUTES, Math.round(numeric))
}

export function normalizeReminders(input = {}) {
  return {
    hourly: {
      enabled: boolValue(input.hourly?.enabled, DEFAULT_REMINDERS.hourly.enabled),
      systemNotification: boolValue(input.hourly?.systemNotification, false)
    },
    water: {
      enabled: boolValue(input.water?.enabled, DEFAULT_REMINDERS.water.enabled),
      intervalMinutes: intervalValue(input.water?.intervalMinutes, DEFAULT_REMINDERS.water.intervalMinutes),
      systemNotification: boolValue(input.water?.systemNotification, false)
    },
    sedentary: {
      enabled: boolValue(input.sedentary?.enabled, DEFAULT_REMINDERS.sedentary.enabled),
      intervalMinutes: intervalValue(input.sedentary?.intervalMinutes, DEFAULT_REMINDERS.sedentary.intervalMinutes),
      systemNotification: boolValue(input.sedentary?.systemNotification, false)
    },
    work: {
      enabled: boolValue(input.work?.enabled, DEFAULT_REMINDERS.work.enabled),
      systemNotification: boolValue(input.work?.systemNotification, false)
    }
  }
}

export function minutesAgo(now, minutes) {
  return new Date(now.getTime() - minutes * 60 * 1000)
}

function minutesSince(now, previous) {
  if (!previous) return Infinity
  return (now.getTime() - new Date(previous).getTime()) / 60000
}

function hourKey(now) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}`
}

function minuteOfDayFromTime(time) {
  if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) return null
  const [hours, minutes] = time.split(':').map(Number)
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function nowMinuteOfDay(now) {
  return now.getHours() * 60 + now.getMinutes()
}

function dayKey(now) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function pushWorkEvent(events, now, state, reminder, type, minute, text, action = 'waving') {
  if (nowMinuteOfDay(now) !== minute) return
  if (!state.firedWorkKeys) state.firedWorkKeys = new Set()
  const key = `${dayKey(now)}:${type}`
  if (state.firedWorkKeys.has(key)) return
  state.firedWorkKeys.add(key)
  events.push({
    type,
    title: 'Always Here',
    text,
    action,
    systemNotification: reminder.systemNotification
  })
}

export function getDueReminderEvents(now, reminderInput, state, config) {
  const reminders = normalizeReminders(reminderInput)
  const events = []

  if (reminders.hourly.enabled && now.getMinutes() === 0) {
    const key = hourKey(now)
    if (state.lastHourlyKey !== key) {
      state.lastHourlyKey = key
      events.push({
        type: 'hourly',
        title: '整点报时',
        text: `现在是 ${String(now.getHours()).padStart(2, '0')}:00`,
        action: 'waving',
        systemNotification: reminders.hourly.systemNotification
      })
    }
  }

  if (reminders.water.enabled && minutesSince(now, state.lastWaterAt) >= reminders.water.intervalMinutes) {
    state.lastWaterAt = now
    events.push({
      type: 'water',
      title: '喝水提醒',
      text: '该喝点水啦',
      action: 'waiting',
      systemNotification: reminders.water.systemNotification
    })
  }

  if (reminders.sedentary.enabled && minutesSince(now, state.lastSedentaryAt) >= reminders.sedentary.intervalMinutes) {
    state.lastSedentaryAt = now
    events.push({
      type: 'sedentary',
      title: '久坐提醒',
      text: '起来活动一下吧',
      action: 'jumping',
      systemNotification: reminders.sedentary.systemNotification
    })
  }

  if (reminders.work.enabled) {
    const clockIn = minuteOfDayFromTime(config?.wageman?.clockIn || '09:00')
    const clockOut = minuteOfDayFromTime(config?.wageman?.clockOut || '17:00')
    if (clockIn !== null) {
      pushWorkEvent(events, now, state, reminders.work, 'work-start', clockIn, '到上班时间啦', 'running')
    }
    pushWorkEvent(events, now, state, reminders.work, 'work-lunch', 12 * 60, '午间休息一下吧', 'waiting')
    if (clockOut !== null) {
      pushWorkEvent(events, now, state, reminders.work, 'work-off-soon', Math.max(0, clockOut - 10), '再坚持一下，快下班了', 'review')
      pushWorkEvent(events, now, state, reminders.work, 'work-end', clockOut, '下班啦，辛苦了', 'waving')
    }
  }

  return events
}
