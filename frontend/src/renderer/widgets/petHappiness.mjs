export const MOOD_LEVELS = {
  GRUMPY: 'grumpy',
  NORMAL: 'normal',
  HAPPY: 'happy'
}

export const HAPPINESS_IMPACT = {
  'reminder-done': 5,
  'reminder-skipped': -2,
  'reminder-timeout': -4,
  'pomodoro-done': 10,
  'work-stop': 2,
  'overtime-penalty': -5 // applied per hour of overtime
}

export function getMoodLevel(happiness) {
  if (happiness < 30) return MOOD_LEVELS.GRUMPY
  if (happiness > 80) return MOOD_LEVELS.HAPPY
  return MOOD_LEVELS.NORMAL
}

export function calculateHappiness(currentHappiness, event) {
  let impact = 0
  
  if (event.type === 'reminder-response') {
    if (event.result === 'done') impact = HAPPINESS_IMPACT['reminder-done']
    else if (event.result === 'skipped') impact = HAPPINESS_IMPACT['reminder-skipped']
    else if (event.result === 'timeout') impact = HAPPINESS_IMPACT['reminder-timeout']
  } else if (event.type === 'pomodoro-done') {
    impact = HAPPINESS_IMPACT['pomodoro-done']
  } else if (event.type === 'work-stop') {
    impact = HAPPINESS_IMPACT['work-stop']
    const overtimeHours = (event.overtimeMs || 0) / 3600000
    if (overtimeHours > 0) {
      impact += Math.floor(overtimeHours * HAPPINESS_IMPACT['overtime-penalty'])
    }
  }

  const nextHappiness = Math.min(100, Math.max(0, currentHappiness + impact))
  return nextHappiness
}
