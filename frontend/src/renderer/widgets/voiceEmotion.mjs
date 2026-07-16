// 小智 llm.emotion → 语义动作映射。
// pet.js 会根据当前宠物能力把新动作解析为完整动作或 v1 回退动作。

const EMOTION_TO_ANIMATION = {
  happy: 'dance',
  laughing: 'dance',
  loving: 'cheer',
  kissy: 'cheer',
  winking: 'waving',
  confident: 'spin',
  cool: 'spin',
  delicious: 'eat',
  funny: 'waving',
  thinking: 'study',
  confused: 'nod',
  surprised: 'nod',
  shocked: 'nod',
  sad: 'failed',
  crying: 'failed',
  angry: 'stomp',
  embarrassed: 'failed',
  relaxed: 'stretch',
  sleepy: 'sleep',
  silly: 'waiting',
  neutral: 'waiting'
}

const EMOTION_TO_EMOTE = {
  happy: '✨',
  laughing: '♪',
  loving: '♥',
  kissy: '♥',
  confident: '★',
  cool: '★',
  thinking: '💧',
  confused: '?',
  surprised: '!',
  shocked: '!',
  angry: '💢',
  embarrassed: '//'
}

// 将小智 emotion 映射为宠物动画名;未知 emotion 回落到 waiting(倾听/待机感)
export function emotionToAnimation(emotion) {
  if (typeof emotion !== 'string') return 'waiting'
  return EMOTION_TO_ANIMATION[emotion] || 'waiting'
}

export function emotionToEmote(emotion) {
  if (typeof emotion !== 'string') return null
  return EMOTION_TO_EMOTE[emotion] || null
}

// 语音对话阶段 → 宠物动画
export const VOICE_PHASE_ANIMATION = {
  idle: 'idle',
  listening: 'waiting', // 倾听:待机专注感
  thinking: 'study', // 等待小智回复:专注思考
  speaking: null // 说话时由 emotion 驱动(见 emotionToAnimation)
}
