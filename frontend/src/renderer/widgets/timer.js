import { appendActivityLog } from '../utils/activityLog.mjs'
import { showConfirm } from '../utils/ui.mjs'
import { PET_EVENTS } from '../utils/events.mjs'

let timerState = {
  running: false,
  startTime: 0,
  elapsed: 0,
  laps: [],
  rafId: null,
  mode: 'stopwatch', // 'stopwatch' or 'pomodoro'
  phase: 'work',      // 'work' or 'break'
  remaining: 0
}

// F5:秒表计次(laps)与暂停态累计时长(elapsed)持久化到 config,重启不丢。
// 番茄钟运行中状态不持久化(跨重启继续倒计时易错,重启重置更合理)。
function persistStopwatch() {
  const config = getConfigFn()
  if (!config.widgets?.timer) return
  config.widgets.timer.laps = timerState.laps.slice()
  config.widgets.timer.elapsed = timerState.elapsed
  saveConfigFn()
}

function renderSavedLaps() {
  const lapsEl = document.getElementById('timer-laps')
  if (!lapsEl) return
  lapsEl.innerHTML = ''
  // laps 按记录顺序存储,展示时倒序(最新在上)
  for (let i = timerState.laps.length - 1; i >= 0; i--) {
    const item = document.createElement('div')
    item.className = 'lap-item'
    item.innerHTML = `<span>#${i + 1}</span><span>${formatTime(timerState.laps[i])}</span>`
    lapsEl.appendChild(item)
  }
}

let getConfigFn = null
let saveConfigFn = null

function getStartLabel() {
  return timerState.mode === 'pomodoro' ? '开始专注' : '开始'
}

function formatTime(ms, includeMs = true) {
  const totalSec = Math.max(0, ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = Math.floor(totalSec % 60)
  if (!includeMs) {
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  const cs = Math.floor((ms % 1000) / 10)
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function updateTimerDisplay() {
  const display = document.getElementById('timer-display')
  const phaseIndicator = document.getElementById('timer-phase-indicator')
  if (!display) return

  if (timerState.mode === 'stopwatch') {
    const current = timerState.running 
      ? timerState.elapsed + (performance.now() - timerState.startTime)
      : timerState.elapsed
    display.textContent = formatTime(current)
    phaseIndicator.classList.add('hidden')
  } else {
    let current = timerState.remaining
    if (timerState.running) {
      current = timerState.remaining - (performance.now() - timerState.startTime)
      if (current <= 0) {
        current = 0
        handlePomodoroComplete()
      }
    }
    display.textContent = formatTime(current, false)
    phaseIndicator.classList.remove('hidden')
    const timerSettings = getConfigFn().widgets.timer
    phaseIndicator.textContent = timerState.running
      ? (timerState.phase === 'work' ? '专注中' : '休息中')
      : (timerState.phase === 'work'
          ? `专注 ${timerSettings.workTime || 25} 分钟`
          : `休息 ${timerSettings.breakTime || 5} 分钟`)
    phaseIndicator.style.color = timerState.phase === 'work' ? 'var(--accent)' : '#4ade80'
  }

  if (timerState.running) {
    timerState.rafId = requestAnimationFrame(updateTimerDisplay)
  }
}

function handlePomodoroComplete() {
  timerState.running = false
  cancelAnimationFrame(timerState.rafId)
  window.dispatchEvent(new CustomEvent(PET_EVENTS.POMODORO_STOP))

  const config = getConfigFn()
  const timerSettings = config.widgets.timer

  if (timerState.phase === 'work') {
    // Log work completion
    appendActivityLog(config, {
      type: 'pomodoro-done',
      durationMinutes: timerSettings.workTime,
      createdAt: new Date().toISOString()
    })
    saveConfigFn()
    window.dispatchEvent(new CustomEvent(PET_EVENTS.POMODORO_DONE))

    window.alwaysHere.showNotification({
      title: '专注时间结束',
      body: `辛苦了！完成了一个 ${timerSettings.workTime} 分钟的专注。现在休息一下吧。`
    })

    // Switch to break
    timerState.phase = 'break'
    timerState.remaining = timerSettings.breakTime * 60 * 1000
  } else {
    window.alwaysHere.showNotification({
      title: '休息时间结束',
      body: '休息好了吗？准备开始下一个专注周而复始。'
    })

    // Switch to work
    timerState.phase = 'work'
    timerState.remaining = timerSettings.workTime * 60 * 1000
  }

  const startBtn = document.getElementById('timer-start')
  if (startBtn) {
    startBtn.textContent = getStartLabel()
    startBtn.classList.remove('active')
  }
  updateTimerDisplay()
}

async function toggleMode() {
  if (timerState.running) {
    if (!await showConfirm('切换模式将停止当前计时，确定吗？')) return
    timerState.running = false
    cancelAnimationFrame(timerState.rafId)
    const startBtn = document.getElementById('timer-start')
    if (startBtn) {
      startBtn.textContent = getStartLabel()
      startBtn.classList.remove('active')
    }
  }

  const config = getConfigFn()
  timerState.mode = timerState.mode === 'stopwatch' ? 'pomodoro' : 'stopwatch'
  config.widgets.timer.mode = timerState.mode
  saveConfigFn()

  resetTimer()
  updateUIForMode()
}

function resetTimer() {
  timerState.running = false
  timerState.elapsed = 0
  timerState.laps = []
  cancelAnimationFrame(timerState.rafId)
  window.dispatchEvent(new CustomEvent(PET_EVENTS.POMODORO_STOP))

  // F5:重置时同步清空持久化的秒表数据
  const config = getConfigFn()
  if (config.widgets?.timer) {
    config.widgets.timer.elapsed = 0
    config.widgets.timer.laps = []
    saveConfigFn()
  }

  if (timerState.mode === 'pomodoro') {
    const timerSettings = getConfigFn().widgets.timer
    timerState.phase = 'work'
    timerState.remaining = (timerSettings.workTime || 25) * 60 * 1000
  }

  const startBtn = document.getElementById('timer-start')
  if (startBtn) {
    startBtn.textContent = getStartLabel()
    startBtn.classList.remove('active')
  }
  
  document.getElementById('timer-laps').innerHTML = ''
  updateTimerDisplay()
}

function updateUIForMode() {
  const modeIndicator = document.getElementById('timer-mode-indicator')
  const actionBtn = document.getElementById('timer-action')
  const lapsEl = document.getElementById('timer-laps')

  if (modeIndicator) {
    modeIndicator.textContent = timerState.mode === 'stopwatch' ? '秒表' : '番茄钟'
  }

  if (actionBtn) {
    actionBtn.textContent = timerState.mode === 'stopwatch' ? '计次' : '跳过'
    // In pomodoro mode, "action" skips the current phase
    actionBtn.title = timerState.mode === 'stopwatch' ? '记录当前时间' : '跳过当前阶段'
  }

  if (lapsEl) {
    lapsEl.classList.toggle('hidden', timerState.mode === 'pomodoro')
  }

  const startBtn = document.getElementById('timer-start')
  if (startBtn && !timerState.running) startBtn.textContent = getStartLabel()
  
  updateTimerDisplay()
}

export function initTimer(getConfig, saveConfig) {
  getConfigFn = getConfig
  saveConfigFn = saveConfig

  const startBtn = document.getElementById('timer-start')
  const actionBtn = document.getElementById('timer-action')
  const resetBtn = document.getElementById('timer-reset')
  const modeIndicator = document.getElementById('timer-mode-indicator')

  const config = getConfigFn()
  const timerSettings = config.widgets.timer
  timerState.mode = timerSettings.mode || 'stopwatch'

  if (timerState.mode === 'pomodoro') {
    timerState.remaining = (timerSettings.workTime || 25) * 60 * 1000
  } else {
    // F5:恢复秒表的累计时长与计次记录(仅秒表模式)
    timerState.elapsed = Number(timerSettings.elapsed) || 0
    timerState.laps = Array.isArray(timerSettings.laps) ? timerSettings.laps.slice() : []
    renderSavedLaps()
  }

  startBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!timerState.running) {
      timerState.running = true
      timerState.startTime = performance.now()
      startBtn.textContent = '暂停'
      startBtn.classList.add('active')
      updateTimerDisplay()
      
      if (timerState.mode === 'pomodoro' && timerState.phase === 'work') {
        window.dispatchEvent(new CustomEvent(PET_EVENTS.POMODORO_START))
      }
    } else {
      timerState.running = false
      if (timerState.mode === 'pomodoro' && timerState.phase === 'work') {
        window.dispatchEvent(new CustomEvent(PET_EVENTS.POMODORO_STOP))
      }
      if (timerState.mode === 'stopwatch') {
        timerState.elapsed += performance.now() - timerState.startTime
        persistStopwatch() // F5:暂停时保存累计时长
      } else {
        timerState.remaining -= performance.now() - timerState.startTime
      }
      cancelAnimationFrame(timerState.rafId)
      startBtn.textContent = timerState.mode === 'pomodoro' ? '继续专注' : '继续'
      startBtn.classList.remove('active')
    }
  })

  actionBtn.addEventListener('click', async (e) => {
    e.stopPropagation()
    if (timerState.mode === 'stopwatch') {
      if (!timerState.running && timerState.elapsed === 0) return
      const current = timerState.running
        ? timerState.elapsed + (performance.now() - timerState.startTime)
        : timerState.elapsed
      timerState.laps.push(current)
      const lapsEl = document.getElementById('timer-laps')
      const item = document.createElement('div')
      item.className = 'lap-item'
      item.innerHTML = `<span>#${timerState.laps.length}</span><span>${formatTime(current)}</span>`
      lapsEl.prepend(item)
      persistStopwatch()
    } else {
      // Pomodoro Skip
      if (await showConfirm(`跳过当前的${timerState.phase === 'work' ? '专注' : '休息'}阶段？`)) {
        handlePomodoroComplete()
      }
    }
  })

  resetBtn.addEventListener('click', async (e) => {
    e.stopPropagation()
    if (await showConfirm('确定要重置吗？')) {
      resetTimer()
    }
  })

  modeIndicator.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleMode()
  })

  updateUIForMode()
}
