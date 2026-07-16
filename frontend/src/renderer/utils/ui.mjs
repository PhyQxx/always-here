let toastContainer = null

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div')
    toastContainer.className = 'toast-container'
    document.body.appendChild(toastContainer)
  }
  return toastContainer
}

export function showToast(message, type = 'info', duration = 3000) {
  const container = getToastContainer()
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = message
  container.appendChild(toast)

  setTimeout(() => {
    toast.classList.add('fade-out')
    setTimeout(() => {
      container.removeChild(toast)
    }, 300)
  }, duration)
}

export function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'confirm-overlay'
    
    const dialog = document.createElement('div')
    dialog.className = 'confirm-dialog'
    
    const text = document.createElement('div')
    text.className = 'confirm-text'
    text.textContent = message
    
    const actions = document.createElement('div')
    actions.className = 'confirm-actions'
    
    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'confirm-btn cancel'
    cancelBtn.textContent = '取消'
    
    const okBtn = document.createElement('button')
    okBtn.className = 'confirm-btn ok'
    okBtn.textContent = '确定'
    
    actions.appendChild(cancelBtn)
    actions.appendChild(okBtn)
    dialog.appendChild(text)
    dialog.appendChild(actions)
    overlay.appendChild(dialog)
    document.body.appendChild(overlay)
    
    const close = (result) => {
      document.body.removeChild(overlay)
      resolve(result)
    }
    
    cancelBtn.onclick = () => close(false)
    okBtn.onclick = () => close(true)
    overlay.onclick = (e) => {
      if (e.target === overlay) close(false)
    }
  })
}
