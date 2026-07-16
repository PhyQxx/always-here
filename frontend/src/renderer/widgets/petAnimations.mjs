export const CELL_WIDTH = 192
export const CELL_HEIGHT = 208

export const V1_ACTIONS = [
  'idle',
  'runningRight',
  'runningLeft',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'running',
  'review'
]

function durations(count, normalDuration, finalDuration) {
  return Array.from({ length: count }, (_, index) => (
    index === count - 1 ? finalDuration : normalDuration
  ))
}

export const ANIMATIONS = {
  idle: {
    row: 0,
    frames: 6,
    durations: [280, 110, 110, 140, 140, 320]
  },
  runningRight: {
    row: 1,
    frames: 8,
    durations: durations(8, 120, 220)
  },
  runningLeft: {
    row: 2,
    frames: 8,
    durations: durations(8, 120, 220)
  },
  waving: {
    row: 3,
    frames: 4,
    durations: durations(4, 140, 280)
  },
  jumping: {
    row: 4,
    frames: 5,
    durations: durations(5, 140, 280)
  },
  failed: {
    row: 5,
    frames: 8,
    durations: durations(8, 140, 240)
  },
  waiting: {
    row: 6,
    frames: 6,
    durations: durations(6, 150, 260)
  },
  running: {
    row: 7,
    frames: 6,
    durations: durations(6, 120, 220)
  },
  review: {
    row: 8,
    frames: 6,
    durations: durations(6, 150, 280),
    playback: 'loop',
    role: 'base'
  },
  dance: {
    row: 9,
    frames: 6,
    durations: durations(6, 130, 220),
    playback: 'once'
  },
  cheer: {
    row: 10,
    frames: 4,
    durations: durations(4, 150, 260),
    playback: 'once'
  },
  spin: {
    row: 11,
    frames: 6,
    durations: durations(6, 120, 220),
    playback: 'once'
  },
  sleep: {
    row: 12,
    frames: 4,
    durations: durations(4, 400, 520),
    playback: 'loop',
    role: 'base'
  },
  yawn: {
    row: 13,
    frames: 4,
    durations: durations(4, 200, 320),
    playback: 'once'
  },
  stretch: {
    row: 14,
    frames: 4,
    durations: durations(4, 180, 300),
    playback: 'once'
  },
  nod: {
    row: 15,
    frames: 4,
    durations: durations(4, 160, 280),
    playback: 'once'
  },
  study: {
    row: 16,
    frames: 6,
    durations: durations(6, 200, 320),
    playback: 'loop',
    role: 'base'
  },
  stomp: {
    row: 17,
    frames: 4,
    durations: durations(4, 150, 280),
    playback: 'once'
  },
  eat: {
    row: 18,
    frames: 6,
    durations: durations(6, 180, 300),
    playback: 'once'
  }
}

export const ACTION_FALLBACKS = {
  dance: 'waving',
  cheer: 'waving',
  spin: 'jumping',
  sleep: 'waiting',
  yawn: 'waiting',
  stretch: 'jumping',
  nod: 'waiting',
  study: 'review',
  stomp: 'failed',
  eat: 'waving'
}

export const AMBIENT_ACTIONS = [
  'waving', 'jumping', 'waiting', 'review', 'dance', 'cheer', 'spin',
  'yawn', 'stretch', 'nod'
]

export function getAnimation(animationName) {
  return ANIMATIONS[animationName] || ANIMATIONS.idle
}

export function hasAnimation(animationName) {
  return Object.prototype.hasOwnProperty.call(ANIMATIONS, animationName)
}

export function getSupportedActions(declaredActions, imageHeight) {
  const maxRows = Math.floor(Number(imageHeight) / CELL_HEIGHT)
  const requested = Array.isArray(declaredActions) ? declaredActions : V1_ACTIONS
  const supported = requested.filter(action => {
    const animation = ANIMATIONS[action]
    return animation && animation.row < maxRows
  })
  if (!supported.includes('idle') && maxRows > 0) supported.unshift('idle')
  return new Set(supported)
}

export function resolvePetAction(actionName, supportedActions = new Set(V1_ACTIONS)) {
  const requested = hasAnimation(actionName) ? actionName : 'idle'
  if (supportedActions.has(requested)) return requested
  const fallback = ACTION_FALLBACKS[requested] || 'idle'
  return supportedActions.has(fallback) ? fallback : 'idle'
}

export function getFrameDuration(animationName, frameIndex) {
  const animation = getAnimation(animationName)
  return animation.durations[frameIndex % animation.durations.length]
}

export function getFrameSource(animationName, frameIndex) {
  const animation = getAnimation(animationName)
  return {
    sx: (frameIndex % animation.frames) * CELL_WIDTH,
    sy: animation.row * CELL_HEIGHT,
    sw: CELL_WIDTH,
    sh: CELL_HEIGHT
  }
}

export function pickAmbientAction(lastAction, random = Math.random) {
  const options = AMBIENT_ACTIONS.filter(action => action !== lastAction)
  const choices = options.length ? options : AMBIENT_ACTIONS
  return choices[Math.floor(random() * choices.length)]
}

export function pickAmbientActionByContext({
  happiness = 70,
  lastAction = null,
  random = Math.random
} = {}) {
  const actions = happiness > 80
    ? ['dance', 'cheer', 'spin', 'waving', 'jumping']
    : happiness < 30
      ? ['yawn', 'stretch', 'waiting', 'review']
      : ['waving', 'jumping', 'nod', 'review', 'waiting']
  const choices = actions.filter(action => action !== lastAction)
  const pool = choices.length ? choices : actions
  return pool[Math.floor(random() * pool.length)]
}

export function getDragAction(deltaX, threshold = 6) {
  if (deltaX > threshold) return 'runningRight'
  if (deltaX < -threshold) return 'runningLeft'
  return null
}

export function getDragActionFromMovement(deltaX, totalDeltaX) {
  return getDragAction(deltaX) || getDragAction(totalDeltaX)
}
