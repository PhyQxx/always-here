let timerState = { running: false, startTime: 0, elapsed: 0, laps: [], rafId: null }

function formatTime(ms) {
  const totalSec = ms / 1000
  const min = Math.floor(totalSec / 60)
  const sec = Math.floor(totalSec % 60)
  const cs = Math.floor((ms % 1000) / 10)
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function updateTimerDisplay() {
  if (!timerState.running) return
  const current = timerState.elapsed + (performance.now() - timerState.startTime)
  document.getElementById('timer-display').textContent = formatTime(current)
  timerState.rafId = requestAnimationFrame(updateTimerDisplay)
}

export function initTimer() {
  const startBtn = document.getElementById('timer-start')
  const lapBtn = document.getElementById('timer-lap')
  const resetBtn = document.getElementById('timer-reset')

  startBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!timerState.running) {
      timerState.running = true
      timerState.startTime = performance.now()
      startBtn.textContent = '暂停'
      startBtn.classList.add('active')
      updateTimerDisplay()
    } else {
      timerState.running = false
      timerState.elapsed += performance.now() - timerState.startTime
      cancelAnimationFrame(timerState.rafId)
      startBtn.textContent = '继续'
      startBtn.classList.remove('active')
    }
  })

  lapBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!timerState.running) return
    const current = timerState.elapsed + (performance.now() - timerState.startTime)
    timerState.laps.push(current)
    const lapsEl = document.getElementById('timer-laps')
    const item = document.createElement('div')
    item.className = 'lap-item'
    item.innerHTML = `<span>#${timerState.laps.length}</span><span>${formatTime(current)}</span>`
    lapsEl.prepend(item)
  })

  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    timerState.running = false
    timerState.elapsed = 0
    timerState.laps = []
    cancelAnimationFrame(timerState.rafId)
    document.getElementById('timer-display').textContent = '00:00.00'
    document.getElementById('timer-laps').innerHTML = ''
    startBtn.textContent = '开始'
    startBtn.classList.remove('active')
  })
}
