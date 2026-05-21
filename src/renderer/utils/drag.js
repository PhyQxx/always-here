let activeDrag = null
let clickThroughState = true // current IPC state
let hasFocus = false          // input/textarea is focused

function isOverWidget(x, y) {
  const widgets = document.querySelectorAll('.widget:not(.hidden)')
  const settingsPanel = document.getElementById('settings-panel')
  const activityPanel = document.getElementById('activity-panel')
  for (const w of widgets) {
    const rect = w.getBoundingClientRect()
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true
  }
  if (settingsPanel && !settingsPanel.classList.contains('hidden')) {
    const rect = settingsPanel.getBoundingClientRect()
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true
  }
  if (activityPanel && !activityPanel.classList.contains('hidden')) {
    const rect = activityPanel.getBoundingClientRect()
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true
  }
  return false
}

function setClickThrough(ignore) {
  if (ignore === clickThroughState && !hasFocus) return
  // Never enable click-through while an input is focused
  if (ignore && hasFocus) return
  clickThroughState = ignore
  window.alwaysHere.setClickThrough(ignore)
}

export function initClickThrough() {
  document.addEventListener('mousemove', (e) => {
    if (activeDrag) return
    setClickThrough(!isOverWidget(e.clientX, e.clientY))
  })

  // Lock click-through OFF while any input is focused
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
  activeDrag.el.style.cursor = 'grab'
  if (activeDrag.hasMoved) activeDrag.saveConfig()
  activeDrag.el.dispatchEvent(new CustomEvent('widget-drag-end', {
    detail: { widgetKey: activeDrag.widgetKey }
  }))
  activeDrag = null
})
