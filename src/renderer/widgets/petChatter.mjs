export const PET_CHAT_INTERVAL_MS = 60 * 1000
export const PET_CHAT_BUBBLE_DURATION_MS = 7000

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

export function getPetChatLines(now = new Date()) {
  return [
    ...BASE_CHAT_LINES,
    ...PERIOD_CHAT_LINES[getChatPeriod(now)]
  ]
}

export function pickPetChatLine({
  now = new Date(),
  previousLine = null,
  lines = getPetChatLines(now),
  random = Math.random
} = {}) {
  const choices = lines.length > 1
    ? lines.filter(line => line !== previousLine)
    : lines
  const index = Math.floor(random() * choices.length)
  return choices[Math.min(index, choices.length - 1)]
}

export function shouldShowPetChat({ hasPendingReminder = false, bubbleVisible = false } = {}) {
  return !hasPendingReminder && !bubbleVisible
}
