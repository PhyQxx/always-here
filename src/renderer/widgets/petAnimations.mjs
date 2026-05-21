export const CELL_WIDTH = 192
export const CELL_HEIGHT = 208

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
    durations: durations(6, 150, 280)
  }
}

export const AMBIENT_ACTIONS = ['waving', 'jumping', 'waiting', 'review']

export function getAnimation(animationName) {
  return ANIMATIONS[animationName] || ANIMATIONS.idle
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

export function getDragAction(deltaX, threshold = 6) {
  if (deltaX > threshold) return 'runningRight'
  if (deltaX < -threshold) return 'runningLeft'
  return null
}

export function getDragActionFromMovement(deltaX, totalDeltaX) {
  return getDragAction(deltaX) || getDragAction(totalDeltaX)
}
