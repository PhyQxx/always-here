let noteSaveTimeout = null
let getConfigFn = null
let saveConfigFn = null

export function initNote(getConfig, saveConfig) {
  getConfigFn = getConfig
  saveConfigFn = saveConfig

  const textarea = document.getElementById('note-content')
  textarea.value = getConfig().noteText || ''

  textarea.addEventListener('input', () => {
    getConfig().noteText = textarea.value
    if (noteSaveTimeout) clearTimeout(noteSaveTimeout)
    noteSaveTimeout = setTimeout(() => saveConfig(), 1000)
  })

  textarea.addEventListener('mousedown', (e) => e.stopPropagation())
}
