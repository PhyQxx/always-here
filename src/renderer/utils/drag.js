let activeDrag = null
let clickThroughState = true // current IPC state
let hasFocus = false          // input/textarea is focused
let pendingRaf = null
let lastMouseX = 0
let lastMouseY = 0

let cachedWidgets = null
let cachedSettingsPanel = null
let cachedActivityPanel = null

function getCachedElements() {
  if (!cachedWidgets) {
    cachedWidgets = Array.from(document.querySelectorAll('.widget'))
    cachedSettingsPanel = document.getElementById('settings-panel')
    cachedActivityPanel = document.getElementById('activity-panel')
  }
  return { cachedWidgets, cachedSettingsPanel, cachedActivityPanel }
}

function isOverWidget(x, y) {
  const { cachedWidgets, cachedSettingsPanel, cachedActivityPanel } = getCachedElements()
  for (const w of cachedWidgets) {
    if (w.classList.contains('hidden')) continue
    const rect = w.getBoundingClientRect()
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true

    // Special case for pet bubble which can overflow the widget container
    if (w.id === 'widget-pet') {
      const bubble = document.getElementById('pet-bubble')
      if (bubble && !bubble.classList.contains('hidden')) {
        const bRect = bubble.getBoundingClientRect()
        if (x >= bRect.left && x <= bRect.right && y >= bRect.top && y <= bRect.bottom) return true
      }
    }
  }
  if (cachedSettingsPanel && !cachedSettingsPanel.classList.contains('hidden')) {
    const rect = cachedSettingsPanel.getBoundingClientRect()
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true
  }
  if (cachedActivityPanel && !cachedActivityPanel.classList.contains('hidden')) {
    const rect = cachedActivityPanel.getBoundingClientRect()
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true
  }
  return false
}

function setClickThrough(ignore) {
  if (ignore === clickThroughState && !hasFocus) return
  if (ignore && hasFocus) return
  clickThroughState = ignore
  window.alwaysHere.setClickThrough(ignore)
}

function scheduleClickThroughCheck() {
  if (pendingRaf) return
  pendingRaf = requestAnimationFrame(() => {
    pendingRaf = null
    setClickThrough(!isOverWidget(lastMouseX, lastMouseY))
  })
}

export function initClickThrough() {
  document.addEventListener('mousemove', (e) => {
    if (activeDrag) return
    lastMouseX = e.clientX
    lastMouseY = e.clientY
    scheduleClickThroughCheck()
  })

  document.addEventListener('focusin', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
      hasFocus = true
      setClickThrough(false)
    }
  })
  document.addEventListener('focusout', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
      hasFocus = false
    }
  })
}

export function makeDraggable(el, widgetKey, config, saveConfig) {
  el.addEventListener('mousedown', (e) => {
    if (['TEXTAREA', 'BUTTON', 'INPUT'].includes(e.target.tagName)) return
    activeDrag = {
      el, widgetKey, config, saveConfig,
      offsetX: e.clientX - el.offsetLeft,
      offsetY: e.clientY - el.offsetTop,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      hasMoved: false
    }
    el.classList.add('is-dragging')
    el.style.cursor = 'grabbing'
  })
}

// Single global handler — only the active widget moves
document.addEventListener('mousemove', (e) => {
  if (!activeDrag) return
  const dx = e.clientX - activeDrag.startX
  const dy = e.clientY - activeDrag.startY
  const movementX = e.clientX - activeDrag.lastX
  activeDrag.lastX = e.clientX
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) activeDrag.hasMoved = true
  const x = e.clientX - activeDrag.offsetX
  const y = e.clientY - activeDrag.offsetY
  activeDrag.el.style.left = x + 'px'
  activeDrag.el.style.top = y + 'px'
  if (activeDrag.config.widgets[activeDrag.widgetKey]) {
    activeDrag.config.widgets[activeDrag.widgetKey].x = x
    activeDrag.config.widgets[activeDrag.widgetKey].y = y
  }
  activeDrag.el.dispatchEvent(new CustomEvent('widget-drag', {
    detail: {
      widgetKey: activeDrag.widgetKey,
      deltaX: movementX,
      totalDeltaX: dx,
      totalDeltaY: dy
    }
  }))
})

document.addEventListener('mouseup', () => {
  if (!activeDrag) return
  activeDrag.el.classList.remove('is-dragging')
  activeDrag.el.style.cursor = 'grab'
  if (activeDrag.hasMoved) activeDrag.saveConfig()
  activeDrag.el.dispatchEvent(new CustomEvent('widget-drag-end', {
    detail: { widgetKey: activeDrag.widgetKey }
  }))
  activeDrag = null
})
