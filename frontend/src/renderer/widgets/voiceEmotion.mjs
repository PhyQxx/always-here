// 小智 llm.emotion(21 种) → 现有宠物动画名映射
// 不新增精灵图行,只复用 petAnimations.mjs 已定义的 9 种动画

// petAnimations.mjs 可用动画:idle, runningRight, runningLeft, waving, jumping,
// failed, waiting, running, review

const EMOTION_TO_ANIMATION = {
  // 开心/积极 → waving
  happy: 'waving',
  laughing: 'waving',
  loving: 'waving',
  kissy: 'waving',
  winking: 'waving',
  confident: 'waving',
  cool: 'waving',
  delicious: 'waving',
  funny: 'waving',
  // 思考/困惑 → review(看着像在琢磨)
  thinking: 'review',
  confused: 'review',
  surprised: 'review',
  shocked: 'review',
  // 消极 → failed
  sad: 'failed',
  crying: 'failed',
  angry: 'failed',
  embarrassed: 'failed',
  // 放松/犯困 → waiting
  relaxed: 'waiting',
  sleepy: 'waiting',
  silly: 'waiting',
  neutral: 'waiting'
}

// 将小智 emotion 映射为宠物动画名;未知 emotion 回落到 waiting(倾听/待机感)
export function emotionToAnimation(emotion) {
  if (typeof emotion !== 'string') return 'waiting'
  return EMOTION_TO_ANIMATION[emotion] || 'waiting'
}

// 语音对话阶段 → 宠物动画
export const VOICE_PHASE_ANIMATION = {
  idle: 'idle',
  listening: 'waiting', // 倾听:待机专注感
  thinking: 'review', // 等待小智回复:琢磨
  speaking: null // 说话时由 emotion 驱动(见 emotionToAnimation)
}
