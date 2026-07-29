// 极简 Markdown 渲染器(无第三方依赖)
// 支持的语法:标题 #、加粗 **、斜体 *、无序列表 -/+/*、有序列表 1.、代码块 ```、分隔线 ---、行内代码 `、段落
// 安全策略:先对原始文本整体转义,再做替换;所有用户/模型内容都不会作为 HTML 原样注入。

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str == null ? '' : String(str)
  return div.innerHTML
}

// 行内格式:加粗、斜体、行内代码。在已转义的文本上操作,替换为 <em>/<strong>/<code>。
function renderInline(escaped) {
  return escaped
    // 行内代码(优先处理,避免内部内容被其它规则二次处理)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // 加粗 **text** 或 __text__
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    // 斜体 *text* 或 _text_(放在加粗之后,避免吞掉 **)
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')
}

export function renderMarkdown(text) {
  if (!text) return ''
  // 先整体转义,杜绝 XSS
  const escaped = escapeHtml(text)
  const lines = escaped.split('\n')

  const html = []
  let inCodeBlock = false
  let codeBuffer = []
  let listType = null        // 'ul' | 'ol' | null,用于连续列表项合并
  let paragraphBuffer = []

  const flushParagraph = () => {
    if (paragraphBuffer.length) {
      html.push(`<p>${renderInline(paragraphBuffer.join(' '))}</p>`)
      paragraphBuffer = []
    }
  }
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`)
      listType = null
    }
  }

  for (const raw of lines) {
    const line = raw

    // 代码块围栏 ```
    if (/^```/.test(line.trim())) {
      if (inCodeBlock) {
        html.push(`<pre><code>${codeBuffer.join('\n')}</code></pre>`)
        codeBuffer = []
        inCodeBlock = false
      } else {
        flushParagraph()
        closeList()
        inCodeBlock = true
      }
      continue
    }
    if (inCodeBlock) {
      codeBuffer.push(line)
      continue
    }

    // 空行:结束当前段落/列表
    if (line.trim() === '') {
      flushParagraph()
      closeList()
      continue
    }

    // 分隔线 --- 或 ***
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph()
      closeList()
      html.push('<hr>')
      continue
    }

    // 标题 # ~ ######
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flushParagraph()
      closeList()
      const level = heading[1].length
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      continue
    }

    // 无序列表项 - / + / *
    const ulItem = line.match(/^\s*[-+*]\s+(.*)$/)
    if (ulItem) {
      flushParagraph()
      if (listType !== 'ul') {
        closeList()
        html.push('<ul>')
        listType = 'ul'
      }
      html.push(`<li>${renderInline(ulItem[1])}</li>`)
      continue
    }

    // 有序列表项 1. 2. ...
    const olItem = line.match(/^\s*\d+\.\s+(.*)$/)
    if (olItem) {
      flushParagraph()
      if (listType !== 'ol') {
        closeList()
        html.push('<ol>')
        listType = 'ol'
      }
      html.push(`<li>${renderInline(olItem[1])}</li>`)
      continue
    }

    // 引用 >(注意:整体转义后 > 已变成 &gt;,所以这里匹配 &gt;)
    const quote = line.match(/^(?:>|&gt;)\s?(.*)$/)
    if (quote) {
      flushParagraph()
      closeList()
      html.push(`<blockquote>${renderInline(quote[1])}</blockquote>`)
      continue
    }

    // 普通文本:并入段落缓冲(连续行合并为一个 <p>)
    closeList()
    paragraphBuffer.push(line.trim())
  }

  // 收尾:未闭合的代码块/列表/段落
  if (inCodeBlock && codeBuffer.length) {
    html.push(`<pre><code>${codeBuffer.join('\n')}</code></pre>`)
  } else if (listType) {
    html.push(`</${listType}>`)
  }
  flushParagraph()

  return html.join('\n')
}
