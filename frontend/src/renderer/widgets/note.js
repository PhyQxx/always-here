let getConfigFn = null
let saveConfigFn = null

// 转义用户输入,防止粘贴含 <script>/<img onerror> 等内容时在 innerHTML 中执行
function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str == null ? '' : String(str)
  return div.innerHTML
}

function parseNoteToHtml(text) {
  if (!text) return '<div class="empty-note">点击输入内容...</div>'

  const lines = text.split('\n')
  return lines.map((line, index) => {
    // Check for task list format: - [ ] or - [x]
    const taskMatch = line.match(/^(\s*)-\s*\[([ xX])] (.*)$/)
    if (taskMatch) {
      const indent = taskMatch[1]
      const checked = taskMatch[2].toLowerCase() === 'x'
      const content = escapeHtml(taskMatch[3])
      return `
        <div class="task-item ${checked ? 'completed' : ''}" data-line="${index}" style="margin-left: ${indent.length * 8}px">
          <input type="checkbox" class="task-checkbox" ${checked ? 'checked' : ''}>
          <span class="task-text">${content}</span>
        </div>
      `
    }
    return `<div class="note-line">${line ? escapeHtml(line) : '&nbsp;'}</div>`
  }).join('')
}

function updateNote(config) {
  const viewer = document.getElementById('note-viewer')
  const editor = document.getElementById('note-editor')
  const text = config.noteText || ''
  
  viewer.innerHTML = parseNoteToHtml(text)
  editor.value = text
}

export function initNote(getConfig, saveConfig) {
  getConfigFn = getConfig
  saveConfigFn = saveConfig

  const viewer = document.getElementById('note-viewer')
  const editor = document.getElementById('note-editor')
  const config = getConfigFn()

  updateNote(config)

  viewer.addEventListener('click', (e) => {
    // If clicking a checkbox, handle it separately
    if (e.target.classList.contains('task-checkbox')) {
      const taskItem = e.target.closest('.task-item')
      const lineIndex = parseInt(taskItem.dataset.line)
      const lines = config.noteText.split('\n')
      const line = lines[lineIndex]
      const checked = e.target.checked
      
      lines[lineIndex] = line.replace(/\[([ xX])]/, checked ? '[x]' : '[ ]')
      config.noteText = lines.join('\n')
      saveConfigFn()
      updateNote(config)
      return
    }

    // Otherwise, switch to edit mode
    viewer.classList.add('hidden')
    editor.classList.remove('hidden')
    editor.focus()
  })

  editor.addEventListener('blur', () => {
    config.noteText = editor.value
    saveConfigFn()
    updateNote(config)
    editor.classList.add('hidden')
    viewer.classList.remove('hidden')
  })

  // Prevent drag when clicking inside the note body
  const body = viewer.parentElement
  body.addEventListener('mousedown', (e) => e.stopPropagation())
}
