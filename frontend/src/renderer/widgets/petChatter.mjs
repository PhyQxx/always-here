export const PET_CHAT_INTERVAL_MS = 60 * 1000
import { getMoodLevel, MOOD_LEVELS } from './petHappiness.mjs'

export const PET_CHAT_BUBBLE_DURATION_MS = 5000

export const MIN_PET_CHAT_INTERVAL_MINUTES = 1
export const MAX_PET_CHAT_INTERVAL_MINUTES = 60

export const DEFAULT_PET_CHAT_SETTINGS = {
  enabled: true,
  intervalMinutes: 1,
  quietMode: false,
  tone: 'companion'
}

export const PET_CHAT_TONES = [
  { id: 'companion', label: '陪伴型' },
  { id: 'focus', label: '效率型' },
  { id: 'snark', label: '吐槽型' },
  { id: 'offwork', label: '下班提醒型' }
]

function boolValue(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function intervalValue(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_PET_CHAT_SETTINGS.intervalMinutes
  return Math.min(
    MAX_PET_CHAT_INTERVAL_MINUTES,
    Math.max(MIN_PET_CHAT_INTERVAL_MINUTES, Math.round(numeric))
  )
}

function toneValue(value) {
  return PET_CHAT_TONES.some(tone => tone.id === value)
    ? value
    : DEFAULT_PET_CHAT_SETTINGS.tone
}

export function normalizePetChatSettings(input = {}) {
  return {
    enabled: boolValue(input.enabled, DEFAULT_PET_CHAT_SETTINGS.enabled),
    intervalMinutes: intervalValue(input.intervalMinutes),
    quietMode: boolValue(input.quietMode, DEFAULT_PET_CHAT_SETTINGS.quietMode),
    tone: toneValue(input.tone)
  }
}

export function getPetChatIntervalMs(settings = DEFAULT_PET_CHAT_SETTINGS) {
  return normalizePetChatSettings(settings).intervalMinutes * PET_CHAT_INTERVAL_MS
}

const BASE_CHAT_LINES = [
  '我在这儿，慢慢来。',
  '先做最小的一步。',
  '肩膀放松一下。',
  '喝口水，脑袋会亮。',
  '这一分钟交给现在。',
  '你已经在路上了。',
  '别急，我守着桌面。',
  '把窗口整理一下吧。',
  '深呼吸，重新对焦。',
  '小步也算前进。',
  '先别想太远。',
  '今天也辛苦啦。',
  '我看到你在努力。',
  '休息不是偷懒。',
  '把手腕放松一下。',
  '做完这点就很棒。',
  '注意保存一下。',
  '现在适合清一件小事。',
  '别让脑袋一直满格。',
  '我陪你待机一会儿。'
]

const TONE_CHAT_LINES = {
  companion: [
    '我在这儿陪你。',
    '慢慢来，也很好。',
    '先照顾好自己。'
  ],
  focus: [
    '先定一个小目标。',
    '关掉一个干扰源。',
    '把这步收干净。'
  ],
  snark: [
    '别和任务深情对望。',
    '先动手，别开会。',
    '脑内弹窗先关掉。'
  ],
  offwork: [
    '快到收尾时间啦。',
    '别把今天拖太长。',
    '下班也要有仪式感。'
  ]
}

const PERIOD_CHAT_LINES = {
  morning: [
    '早安，我陪你开工。',
    '上午适合稳稳推进。',
    '今天先从轻的开始。'
  ],
  noon: [
    '午间记得慢点吃。',
    '给眼睛放个小假。',
    '中场休息也很重要。'
  ],
  afternoon: [
    '下午别被困意拿捏。',
    '换个小目标试试。',
    '这一段我们慢慢磨。'
  ],
  evening: [
    '快收尾啦，别硬撑。',
    '整理一下今天的线头。',
    '晚上适合轻轻复盘。'
  ],
  night: [
    '夜深了，收个好尾。',
    '太晚就别逞强啦。',
    '明天也会接住你的。'
  ]
}

function getChatPeriod(now) {
  const hour = now.getHours()
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 14) return 'noon'
  if (hour >= 14 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 23) return 'evening'
  return 'night'
}

function getContextLines(activityContext = {}) {
  const lines = []
  if ((activityContext.missedWaterCount || 0) > 0) {
    lines.push('喝水提醒别攒着。')
  }
  if ((activityContext.missedSedentaryCount || 0) > 0) {
    lines.push('站起来换个气口。')
  }
  if ((activityContext.overtimeMinutes || 0) >= 30) {
    lines.push('加班了，记得收尾。')
  }

  // Wageman context
  if (activityContext.wageman) {
    const { clockOut } = activityContext.wageman
    if (clockOut) {
      const now = new Date()
      const [h, m] = clockOut.split(':').map(Number)
      const offWorkDate = new Date(now)
      offWorkDate.setHours(h, m, 0, 0)
      
      const diffMs = offWorkDate - now
      if (diffMs > 0 && diffMs < 60 * 60 * 1000) { // Less than 1 hour
        const mins = Math.ceil(diffMs / 60000)
        lines.push(`还有 ${mins} 分钟下班，稳住！`)
        lines.push(`看到终点线了，还有 ${mins} 分钟。`)
      } else if (diffMs <= 0 && diffMs > -30 * 60 * 1000) { // Just off work
        lines.push('已经下班啦，收工收工！')
      }
    }
  }

  return lines
}

export function getPetChatLines(now = new Date(), options = {}) {
  const settings = normalizePetChatSettings(options)
  const toneLines = TONE_CHAT_LINES[settings.tone] || TONE_CHAT_LINES.companion
  return [
    ...BASE_CHAT_LINES,
    ...toneLines,
    ...PERIOD_CHAT_LINES[getChatPeriod(now)],
    ...getContextLines(options.activityContext)
  ]
}

export function pickPetChatLine({
  now = new Date(),
  previousLine = null,
  lines = getPetChatLines(now),
  happiness = 70,
  random = Math.random
} = {}) {
  let filtered = lines
  const mood = getMoodLevel(happiness)

  if (mood === MOOD_LEVELS.GRUMPY) {
    // Favor snarky/shorter/questioning lines
    const snarky = lines.filter(l => l.includes('...') || l.includes('？') || l.includes('别') || l.includes('快'))
    if (snarky.length > 0 && random() > 0.3) filtered = snarky
  } else if (mood === MOOD_LEVELS.HAPPY) {
    // Favor encouraging/warmer lines
    const warm = lines.filter(l => !l.includes('...') && (l.includes('❤') || l.includes('♪') || l.includes('棒') || l.includes('好')))
    if (warm.length > 0 && random() > 0.3) filtered = warm
  }

  const choices = filtered.length > 1
    ? filtered.filter(line => line !== previousLine)
    : filtered
  const index = Math.floor(random() * choices.length)
  return choices[Math.min(index, choices.length - 1)]
}

export function shouldShowPetChat({
  enabled = true,
  quietMode = false,
  hasPendingReminder = false,
  bubbleVisible = false,
  force = false
} = {}) {
  if (hasPendingReminder) return false
  if (force) return true
  return enabled && !quietMode && !hasPendingReminder && !bubbleVisible
}
