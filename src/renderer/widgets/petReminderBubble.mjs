export const DEFAULT_BUBBLE_DURATION_MS = 5000
export const CONFIRMABLE_BUBBLE_DURATION_MS = 60 * 1000

const VALID_RESULTS = new Set(['done', 'skipped', 'timeout'])

export function getReminderBubbleDuration(options = {}) {
  if (Number.isFinite(options.duration)) return options.duration
  return options.confirmable ? CONFIRMABLE_BUBBLE_DURATION_MS : DEFAULT_BUBBLE_DURATION_MS
}

export function createReminderResponseEvent(reminderEvent, result, createdAt = new Date().toISOString()) {
  if (!VALID_RESULTS.has(result)) {
    throw new Error(`Unsupported reminder result: ${result}`)
  }
  return {
    type: 'reminder-response',
    reminderType: reminderEvent.type,
    result,
    reminderText: reminderEvent.text,
    createdAt
  }
}
