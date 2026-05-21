import {
  CELL_HEIGHT,
  CELL_WIDTH,
  getAnimation,
  getDragActionFromMovement,
  getFrameDuration,
  getFrameSource,
  pickAmbientAction
} from './petAnimations.mjs'
import {
  getDueReminderEvents,
  normalizeReminders
} from './petReminders.mjs'
import {
  createReminderResponseEvent,
  getReminderBubbleDuration
} from './petReminderBubble.mjs'
import {
  PET_CHAT_BUBBLE_DURATION_MS,
  getPetChatIntervalMs,
  normalizePetChatSettings,
  getPetChatLines,
  pickPetChatLine,
  shouldShowPetChat
} from './petChatter.mjs'
import { appendActivityLog } from '../utils/activityLog.mjs'
import { summarizeRecentDays } from '../utils/activityStats.mjs'

const CANVAS_WIDTH = 130
const CANVAS_HEIGHT = 150

let spriteImg = null
let getConfigFn = null
let saveConfigFn = null
let animTimer = null
let actionTimer = null
let reminderTimer = null
let chatTimer = null
let bubbleTimeout = null
let frameIndex = 0
let currentAnimation = 'idle'
let currentPetId = null
let lastAmbientAction = null
let lastDragAction = null
let lastPetChatLine = null
let pendingReminderEvent = null
let reminderState = {
  lastHourlyKey: null,
  lastWaterAt: null,
  lastSedentaryAt: null,
  firedWorkKeys: new Set()
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function drawFallback() {
  const canvas = document.getElementById('pet-canvas')
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = '56px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('?', canvas.width / 2, canvas.height / 2)
}

function drawPetFrame() {
  const canvas = document.getElementById('pet-canvas')
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (!spriteImg) {
    drawFallback()
    return
  }

  const { sx, sy, sw, sh } = getFrameSource(currentAnimation, frameIndex)
  const scale = Math.min(canvas.width / CELL_WIDTH, canvas.height / CELL_HEIGHT)
  const dw = CELL_WIDTH * scale
  const dh = CELL_HEIGHT * scale
  const dx = (canvas.width - dw) / 2
  const dy = canvas.height - dh

  ctx.drawImage(spriteImg, sx, sy, sw, sh, dx, dy, dw, dh)
}

function scheduleNextFrame() {
  if (animTimer) clearTimeout(animTimer)
  const duration = getFrameDuration(currentAnimation, frameIndex)
  animTimer = setTimeout(() => {
    const animation = getAnimation(currentAnimation)
    if (currentAnimation !== 'idle' && frameIndex >= animation.frames - 1) {
      currentAnimation = 'idle'
      frameIndex = 0
    } else {
      frameIndex = (frameIndex + 1) % animation.frames
    }
    drawPetFrame()
    scheduleNextFrame()
  }, duration)
}

function randomActionDelay() {
  return 12000 + Math.floor(Math.random() * 18000)
}

function playAction(actionName) {
  if (!spriteImg || !getAnimation(actionName)) return
  currentAnimation = actionName
  frameIndex = 0
  drawPetFrame()
  scheduleNextFrame()
}

function setBubbleActionsVisible(visible) {
  const actions = document.getElementById('pet-bubble-actions')
  if (actions) actions.classList.toggle('hidden', !visible)
}

function hideBubble() {
  const bubble = document.getElementById('pet-bubble')
  if (bubbleTimeout) {
    clearTimeout(bubbleTimeout)
    bubbleTimeout = null
  }
  if (bubble) bubble.classList.add('hidden')
  setBubbleActionsVisible(false)
  pendingReminderEvent = null
}

function finishPendingReminder(result) {
  if (!pendingReminderEvent) {
    hideBubble()
    return
  }
  const config = getConfigFn()
  appendActivityLog(config, createReminderResponseEvent(pendingReminderEvent, result))
  saveConfigFn()
  hideBubble()
}

function showBubble(text, options = {}) {
  const bubble = document.getElementById('pet-bubble')
  const bubbleText = document.getElementById('pet-bubble-text')
  if (!bubble || !bubbleText) return
  bubbleText.textContent = text
  bubble.classList.remove('hidden')
  setBubbleActionsVisible(Boolean(options.confirmable))
  if (bubbleTimeout) clearTimeout(bubbleTimeout)
  bubbleTimeout = setTimeout(() => {
    if (options.confirmable) {
      finishPendingReminder('timeout')
      return
    }
    hideBubble()
  }, getReminderBubbleDuration(options))
}

function handleReminderEvent(event) {
  const confirmable = event.type === 'water' || event.type === 'sedentary'
  pendingReminderEvent = confirmable ? event : null
  showBubble(event.text, { confirmable })
  playAction(event.action || 'waving')
  if (event.systemNotification) {
    window.alwaysHere.showNotification({
      title: event.title || 'Always Here',
      body: event.text
    })
  }
}

function recordReminderResult(result) {
  if (result !== 'done' && result !== 'skipped') return
  finishPendingReminder(result)
}

function checkReminders() {
  const config = getConfigFn()
  const reminders = normalizeReminders(config.reminders)
  const events = getDueReminderEvents(new Date(), reminders, reminderState, config)
  events.forEach(handleReminderEvent)
}

function startReminderLoop() {
  if (reminderTimer) clearInterval(reminderTimer)
  const now = new Date()
  if (!reminderState.lastWaterAt) reminderState.lastWaterAt = now
  if (!reminderState.lastSedentaryAt) reminderState.lastSedentaryAt = now
  checkReminders()
  reminderTimer = setInterval(checkReminders, 1000)
}

function showPetChat(options = {}) {
  const config = getConfigFn()
  const chatSettings = normalizePetChatSettings(config.petChat)
  const bubble = document.getElementById('pet-bubble')
  const bubbleVisible = bubble ? !bubble.classList.contains('hidden') : false
  if (!shouldShowPetChat({
    enabled: chatSettings.enabled,
    quietMode: chatSettings.quietMode,
    hasPendingReminder: Boolean(pendingReminderEvent),
    bubbleVisible,
    force: Boolean(options.force)
  })) return
  const recent = summarizeRecentDays(config.activityLog || [], 7)
  const lines = getPetChatLines(new Date(), {
    tone: chatSettings.tone,
    activityContext: {
      missedWaterCount: recent.waterMissed,
      missedSedentaryCount: recent.sedentaryMissed,
      overtimeMinutes: Math.floor(recent.totalOvertimeMs / 60000)
    }
  })
  lastPetChatLine = pickPetChatLine({ previousLine: lastPetChatLine, lines })
  showBubble(lastPetChatLine, { duration: PET_CHAT_BUBBLE_DURATION_MS })
  if (currentAnimation === 'idle') playAction('waving')
}

function startPetChatLoop() {
  if (chatTimer) clearInterval(chatTimer)
  const chatSettings = normalizePetChatSettings(getConfigFn().petChat)
  getConfigFn().petChat = chatSettings
  if (!chatSettings.enabled || chatSettings.quietMode) {
    chatTimer = null
    return
  }
  chatTimer = setInterval(showPetChat, getPetChatIntervalMs(chatSettings))
}

function scheduleAmbientAction(delay = randomActionDelay()) {
  if (actionTimer) clearTimeout(actionTimer)
  actionTimer = setTimeout(() => {
    if (currentAnimation === 'idle') {
      lastAmbientAction = pickAmbientAction(lastAmbientAction)
      playAction(lastAmbientAction)
    }
    scheduleAmbientAction()
  }, delay)
}

async function loadConfiguredPet() {
  const config = getConfigFn()
  const nextPetId = config.petId || 'hina'
  currentPetId = nextPetId

  try {
    const result = await window.alwaysHere.getPetSpritesheet(nextPetId)
    if (currentPetId !== result.id) return
    const loadedImage = await loadImage(result.dataUrl)
    if (currentPetId !== result.id) return
    spriteImg = loadedImage
    currentAnimation = 'idle'
    frameIndex = 0
    drawPetFrame()
  } catch (error) {
    console.warn('Failed to load pet:', error)
    spriteImg = null
    drawFallback()
  }
}

export async function initPet(getConfig, saveConfig) {
  getConfigFn = getConfig
  saveConfigFn = saveConfig

  const canvas = document.getElementById('pet-canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT

  if (!getConfigFn().petId) {
    getConfigFn().petId = 'hina'
    saveConfigFn()
  }

  await loadConfiguredPet()
  scheduleNextFrame()
  scheduleAmbientAction(4000)
  startReminderLoop()
  startPetChatLoop()

  window.addEventListener('pet-selection-changed', async () => {
    await loadConfiguredPet()
  })

  window.addEventListener('reminder-settings-changed', (event) => {
    const now = new Date()
    if (event.detail?.type === 'water') reminderState.lastWaterAt = now
    if (event.detail?.type === 'sedentary') reminderState.lastSedentaryAt = now
    checkReminders()
  })

  window.addEventListener('pet-chat-settings-changed', () => {
    startPetChatLoop()
  })

  window.addEventListener('pet-chat-now', () => {
    showPetChat({ force: true })
  })

  window.addEventListener('pet-reminder', (event) => {
    if (event.detail?.text) handleReminderEvent(event.detail)
  })

  window.addEventListener('pet-action', (event) => {
    if (typeof event.detail === 'string') playAction(event.detail)
  })

  const widget = document.getElementById('widget-pet')
  const bubbleActions = document.getElementById('pet-bubble-actions')
  bubbleActions?.addEventListener('click', (event) => {
    event.stopPropagation()
    const result = event.target?.dataset?.result
    if (result === 'done' || result === 'skipped') recordReminderResult(result)
  })

  widget.addEventListener('mouseenter', () => {
    if (currentAnimation === 'idle') playAction('waving')
  })

  widget.addEventListener('widget-drag', (event) => {
    const action = getDragActionFromMovement(
      event.detail?.deltaX || 0,
      event.detail?.totalDeltaX || 0
    )
    if (!action || action === lastDragAction) return
    lastDragAction = action
    playAction(action)
  })

  widget.addEventListener('widget-drag-end', () => {
    lastDragAction = null
    currentAnimation = 'idle'
    frameIndex = 0
    drawPetFrame()
    scheduleNextFrame()
  })
}
