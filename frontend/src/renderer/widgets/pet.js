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
  calculateHappiness,
  getMoodLevel
} from './petHappiness.mjs'
import {
  PET_CHAT_BUBBLE_DURATION_MS,
  PET_CHAT_TONES,
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
let isFocusing = false
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
    // If focusing, loop current animation. Otherwise revert to idle after non-idle animation finishes.
    if (currentAnimation !== 'idle' && !isFocusing && frameIndex >= animation.frames - 1) {
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
  const event = createReminderResponseEvent(pendingReminderEvent, result)
  appendActivityLog(config, event)
  
  // Update happiness
  config.happiness = calculateHappiness(config.happiness, event)
  
  saveConfigFn()
  hideBubble()
}

function showBubble(text, options = {}) {
  const bubble = document.getElementById('pet-bubble')
  const bubbleText = document.getElementById('pet-bubble-text')
  const moodIndicator = document.getElementById('pet-mood-indicator')
  if (!bubble || !bubbleText) return
  
  if (moodIndicator) {
    const config = getConfigFn()
    const mood = getMoodLevel(config.happiness)
    moodIndicator.textContent = mood === 'happy' ? '😊' : mood === 'grumpy' ? '💢' : '😐'
  }

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

// 从写死台词池里挑一句(作为 AI 不可用时的回落)
function pickLocalChatLine(tone) {
  const config = getConfigFn()
  const recent = summarizeRecentDays(config.activityLog || [], 7)
  const lines = getPetChatLines(new Date(), {
    tone: tone,
    activityContext: {
      missedWaterCount: recent.waterMissed,
      missedSedentaryCount: recent.sedentaryMissed,
      overtimeMinutes: Math.floor(recent.totalOvertimeMs / 60000),
      wageman: config.wageman
    }
  })
  lastPetChatLine = pickPetChatLine({
    previousLine: lastPetChatLine,
    lines,
    happiness: config.happiness
  })
  return lastPetChatLine
}

// 优先走小智 AI 生成台词;未连接/失败时回落到写死台词
async function showPetChat(options = {}) {
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

  const tone = options.tone || chatSettings.tone

  // 语音已启用时,尝试走小智 AI
  if (config.voice?.enabled) {
    const aiOk = await tryAiChat(options.aiPrompt)
    if (aiOk) return
    // AI 不可用 → 回落本地台词(继续往下)
  }

  // 回落:写死台词
  showBubble(pickLocalChatLine(tone), { duration: PET_CHAT_BUBBLE_DURATION_MS })
  if (currentAnimation === 'idle') playAction('waving')
}

// 调小智 AI 说一句;成功返回 true(气泡/动画由 voice 事件驱动)
// prompt 可选,用于引导 AI 生成"主动陪伴/单击"类台词;不传则让小智自由发挥
async function tryAiChat(prompt) {
  try {
    const status = await window.alwaysHere.voiceStatus()
    let connected = status.connected
    if (!connected) {
      // 尝试自动连接(只在已启用时)
      await window.alwaysHere.voiceConnect()
      for (let i = 0; i < 20; i++) {
        const s = await window.alwaysHere.voiceStatus()
        if (s.connected) { connected = true; break }
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    if (!connected) return false
    // 等待 AI 回复期间给个思考提示 + 动画
    showBubble('🤔 想想说什么...', { duration: 5000 })
    if (currentAnimation === 'idle') playAction('review')
    const text = prompt || '主动跟我说一句话,像桌面陪伴伙伴那样。'
    const res = await window.alwaysHere.voiceSendText(text)
    return Boolean(res?.ok)
  } catch {
    return false
  }
}

function startPetChatLoop() {
  if (chatTimer) clearInterval(chatTimer)
  const config = getConfigFn()
  const chatSettings = normalizePetChatSettings(config.petChat)
  config.petChat = chatSettings

  // 视觉(看屏幕)已启用时,定时聊天交给 AI 自主决定(vision-start-loop),
  // 不再跑这个"无脑定时蹦台词"的循环,避免频繁打扰
  if (config.vision?.enabled) {
    chatTimer = null
    return
  }
  // 视觉未启用时:保留本地写死台词兜底(离线陪伴)
  if (!chatSettings.enabled || chatSettings.quietMode) {
    chatTimer = null
    return
  }
  chatTimer = setInterval(showPetChat, getPetChatIntervalMs(chatSettings))
}

function scheduleAmbientAction(delay = randomActionDelay()) {
  if (actionTimer) clearTimeout(actionTimer)
  actionTimer = setTimeout(() => {
    if (currentAnimation === 'idle' && !isFocusing) {
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

  window.addEventListener('tray-command', (event) => {
    const payload = event.detail
    const command = typeof payload === 'string' ? payload : payload.type
    if (command === 'pet-say-now') {
      const toneLabel = PET_CHAT_TONES.find(t => t.id === payload.tone)?.label || '陪伴'
      showPetChat({
        force: true,
        tone: payload.tone,
        aiPrompt: `用${toneLabel}的语气,主动跟我说一句简短的话(15字以内)。`
      })
    }
    if (command === 'toggle-pet-quiet-mode') {
      // handled by tray logic usually, but ensure we update if needed
      startPetChatLoop()
    }
  })

  window.addEventListener('pet-reminder', (event) => {
    if (event.detail?.text) handleReminderEvent(event.detail)
  })

  // 小智对话回复气泡:复用同一气泡,语音回复停留更久(说话中)
  window.addEventListener('pet-voice-reply', (event) => {
    if (!event.detail?.text) return
    const duration = getConfigFn().voice?.bubbleDurationMs || 8000
    showBubble(event.detail.text, { duration })
  })

  window.addEventListener('pet-action', (event) => {
    if (typeof event.detail === 'string') playAction(event.detail)
  })

  window.addEventListener('pomodoro-start', () => {
    isFocusing = true
    playAction('review')
  })

  window.addEventListener('pomodoro-stop', () => {
    isFocusing = false
  })

  window.addEventListener('pomodoro-done', (event) => {
    const config = getConfigFn()
    config.happiness = calculateHappiness(config.happiness, { type: 'pomodoro-done' })
    saveConfigFn()
  })

  window.addEventListener('work-stop', (event) => {
    // work-stop event detail contains the activity entry
    const config = getConfigFn()
    config.happiness = calculateHappiness(config.happiness, event.detail)
    saveConfigFn()
  })

  const widget = document.getElementById('widget-pet')
  const bubbleActions = document.getElementById('pet-bubble-actions')
  bubbleActions?.addEventListener('click', (event) => {
    event.stopPropagation()
    const result = event.target?.dataset?.result
    if (result === 'done' || result === 'skipped') recordReminderResult(result)
  })
  bubbleActions?.addEventListener('mousedown', (event) => {
    event.stopPropagation()
  })

  widget.addEventListener('mouseenter', () => {
    if (currentAnimation === 'idle') playAction('waving')
  })

  widget.addEventListener('click', () => {
    // 若语音输入栏被隐藏(如刚按过 Esc),单击先把它唤回来,不挥手
    const voiceBar = document.getElementById('pet-voice-bar')
    if (voiceBar?.classList.contains('hidden')) {
      window.dispatchEvent(new CustomEvent('pet-voice-show-bar'))
      return
    }
    // 单击只做挥手回应,不触发对话(避免频繁打扰/联网)
    if (currentAnimation === 'idle') playAction('waving')
  })

  widget.addEventListener('dblclick', () => {
    const action = pickAmbientAction(currentAnimation)
    playAction(action)
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
