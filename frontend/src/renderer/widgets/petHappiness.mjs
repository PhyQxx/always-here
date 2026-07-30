export const MOOD_LEVELS = {
  GRUMPY: 'grumpy',
  NORMAL: 'normal',
  HAPPY: 'happy'
}

export const HAPPINESS_IMPACT = {
  'reminder-done': 5,
  'reminder-skipped': -1,
  'reminder-timeout': -2,
  'pomodoro-done': 10,
  'work-stop': 2,
  'overtime-penalty': -3, // applied per hour of overtime
  // F8:日常互动也给少量好感,让"陪伴"行为可感知
  'chat': 1,        // 每次与伙伴对话(文字/语音)
  'interact': 1,    // 每次点击/双击伙伴(同一会话内有去重,见 pet.js)
  'chat-daily-cap': 10  // 对话好感每日上限,避免刷分
}

export function getMoodLevel(happiness) {
  if (happiness < 30) return MOOD_LEVELS.GRUMPY
  if (happiness > 80) return MOOD_LEVELS.HAPPY
  return MOOD_LEVELS.NORMAL
}

// F8:时间衰减。长时间不互动,好感度缓慢下降。
// 规则:距上次互动超过 GRACE_HOURS 小时后,每满 DECAY_INTERVAL_HOURS 衰减 DECAY_PER_INTERVAL 点,
// 最低不低于 0。返回 { happiness, decayed }。
const DECAY_GRACE_HOURS = 48      // 48 小时内不衰减(给足宽限)
const DECAY_INTERVAL_HOURS = 24   // 每 24 小时
const DECAY_PER_INTERVAL = 2      // 衰减 2 点

export function applyHappinessDecay(currentHappiness, lastActiveAtMs, nowMs = Date.now()) {
  if (!Number.isFinite(lastActiveAtMs)) return { happiness: currentHappiness, decayed: 0 }
  const elapsedHours = (nowMs - lastActiveAtMs) / 3600000
  if (elapsedHours <= DECAY_GRACE_HOURS) return { happiness: currentHappiness, decayed: 0 }
  const decayIntervals = Math.floor((elapsedHours - DECAY_GRACE_HOURS) / DECAY_INTERVAL_HOURS)
  const decayed = decayIntervals * DECAY_PER_INTERVAL
  return { happiness: Math.max(0, currentHappiness - decayed), decayed }
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
  } else if (event.type === 'chat') {
    impact = HAPPINESS_IMPACT['chat']
  } else if (event.type === 'interact') {
    impact = HAPPINESS_IMPACT['interact']
  }

  const nextHappiness = Math.min(100, Math.max(0, currentHappiness + impact))
  return nextHappiness
}
