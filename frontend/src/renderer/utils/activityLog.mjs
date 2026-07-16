const MAX_ACTIVITY_LOG_ENTRIES = 500

function createId(createdAt) {
  return `${createdAt}-${Math.random().toString(36).slice(2, 10)}`
}

export function appendActivityLog(config, event) {
  if (!config.activityLog) config.activityLog = []
  const createdAt = event.createdAt || new Date().toISOString()
  const entry = {
    id: event.id || createId(createdAt),
    createdAt,
    ...event
  }
  config.activityLog.push(entry)
  if (config.activityLog.length > MAX_ACTIVITY_LOG_ENTRIES) {
    config.activityLog.splice(0, config.activityLog.length - MAX_ACTIVITY_LOG_ENTRIES)
  }
  return entry
}
