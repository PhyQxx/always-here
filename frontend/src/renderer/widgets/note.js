import { renderMarkdown } from '../utils/markdown.mjs'

let getConfigFn = null
let saveConfigFn = null

// F6:便签内容长度上限,避免超长文本拖慢渲染与存储
const MAX_NOTE_LENGTH = 20000

// 转义用户输入,防止粘贴含 <script>/<img onerror> 等内容时在 innerHTML 中执行
// (renderMarkdown 内部已整体转义,这里用于 checkbox 内容等独立拼接处)
function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str == null ? '' : String(str)
  return div.innerHTML
}

// 把一行文本解析为"待办项"或"普通文本块"。
// 返回数组,元素为 { type: 'task'|'block', ... }
// task 项保留 checkbox 交互;block 项收集连续普通行,后续整体走 renderMarkdown。
function parseNoteSegments(text) {
  const lines = text.split('\n')
  const segments = []
  let blockBuffer = []

  const flushBlock = () => {
    if (blockBuffer.length) {
      segments.push({ type: 'block', text: blockBuffer.join('\n') })
      blockBuffer = []
    }
  }

  for (const line of lines) {
    const taskMatch = line.match(/^(\s*)-\s*\[([ xX])] (.*)$/)
    if (taskMatch) {
      flushBlock()
      segments.push({
        type: 'task',
        indent: taskMatch[1],
        checked: taskMatch[2].toLowerCase() === 'x',
        content: taskMatch[3]
      })
    } else {
      blockBuffer.push(line)
    }
  }
  flushBlock()
  return segments
}

function parseNoteToHtml(text) {
  if (!text) return '<div class="empty-note">点击输入内容...</div>'

  const segments = parseNoteSegments(text)
  return segments.map((seg) => {
    if (seg.type === 'task') {
      const content = escapeHtml(seg.content)
      return `<div class="task-item ${seg.checked ? 'completed' : ''}" style="margin-left: ${seg.indent.length * 8}px">
          <input type="checkbox" class="task-checkbox" ${seg.checked ? 'checked' : ''}>
          <span class="task-text">${content}</span>
        </div>`
    }
    // 普通文本块:走完整 Markdown 渲染(标题/加粗/列表/代码/引用/分隔线等)
    // renderMarkdown 内部已转义,安全
    return renderMarkdown(seg.text)
  }).join('\n')
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
      // 通过 checkbox 元素定位到所在 task-item,再找到它在原文中对应的行
      // task-item 的渲染顺序与 parseNoteSegments 输出一致,据此映射回原行索引
      const allTaskItems = Array.from(viewer.querySelectorAll('.task-item'))
      const taskIndex = allTaskItems.indexOf(e.target.closest('.task-item'))
      if (taskIndex < 0) return

      // 重新解析拿到所有 task 行在原文中的位置
      const lines = config.noteText.split('\n')
      const taskLineIndices = []
      lines.forEach((line, idx) => {
        if (/^\s*-\s*\[([ xX])] .*$/.test(line)) taskLineIndices.push(idx)
      })
      const lineIndex = taskLineIndices[taskIndex]
      if (lineIndex === undefined) return

      const checked = e.target.checked
      // 只替换该行内第一个 [ ]/[x] 标记,避免误伤内容里的方括号
      lines[lineIndex] = lines[lineIndex].replace(/\[([ xX])]/, checked ? '[x]' : '[ ]')
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
    // F6:长度上限保护
    if (editor.value.length > MAX_NOTE_LENGTH) {
      editor.value = editor.value.slice(0, MAX_NOTE_LENGTH)
    }
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
