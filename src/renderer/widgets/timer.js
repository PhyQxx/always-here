import { appendActivityLog } from '../utils/activityLog.mjs'

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

let getConfigFn = null
let saveConfigFn = null

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
    phaseIndicator.textContent = timerState.phase === 'work' ? '专注中' : '休息中'
    phaseIndicator.style.color = timerState.phase === 'work' ? 'var(--accent)' : '#4ade80'
  }

  if (timerState.running) {
    timerState.rafId = requestAnimationFrame(updateTimerDisplay)
  }
}

function handlePomodoroComplete() {
  timerState.running = false
  cancelAnimationFrame(timerState.rafId)
  window.dispatchEvent(new CustomEvent('pomodoro-stop'))
  
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
    window.dispatchEvent(new CustomEvent('pomodoro-done'))

    window.alwaysHere.showNotification({
      title: '专注时间结束',
      body: `辛苦了！完成了一个 ${timerSettings.workTime} 分钟的专注。现在休息一下吧。`
    })

    // Switch to break
    timerState.phase = 'break'
    timerState.remaining = timerSettings.breakTime * 60 * 1000
    window.dispatchEvent(new CustomEvent('pet-action', { detail: 'waving' }))
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
    startBtn.textContent = '开始'
    startBtn.classList.remove('active')
  }
  updateTimerDisplay()
}

function toggleMode() {
  if (timerState.running) {
    if (!confirm('切换模式将停止当前计时，确定吗？')) return
    timerState.running = false
    cancelAnimationFrame(timerState.rafId)
    const startBtn = document.getElementById('timer-start')
    if (startBtn) {
      startBtn.textContent = '开始'
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
  window.dispatchEvent(new CustomEvent('pomodoro-stop'))
  
  if (timerState.mode === 'pomodoro') {
    const timerSettings = getConfigFn().widgets.timer
    timerState.phase = 'work'
    timerState.remaining = (timerSettings.workTime || 25) * 60 * 1000
  }

  const startBtn = document.getElementById('timer-start')
  if (startBtn) {
    startBtn.textContent = '开始'
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
        window.dispatchEvent(new CustomEvent('pomodoro-start'))
      }
    } else {
      timerState.running = false
      if (timerState.mode === 'pomodoro' && timerState.phase === 'work') {
        window.dispatchEvent(new CustomEvent('pomodoro-stop'))
      }
      if (timerState.mode === 'stopwatch') {
        timerState.elapsed += performance.now() - timerState.startTime
      } else {
        timerState.remaining -= performance.now() - timerState.startTime
      }
      cancelAnimationFrame(timerState.rafId)
      startBtn.textContent = '继续'
      startBtn.classList.remove('active')
    }
  })

  actionBtn.addEventListener('click', (e) => {
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
    } else {
      // Pomodoro Skip
      if (confirm(`跳过当前的${timerState.phase === 'work' ? '专注' : '休息'}阶段？`)) {
        handlePomodoroComplete()
      }
    }
  })

  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (confirm('确定要重置吗？')) {
      resetTimer()
    }
  })

  modeIndicator.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleMode()
  })

  updateUIForMode()
}
