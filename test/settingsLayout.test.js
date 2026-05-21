const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('settings panel layout stays inside the viewport and scrolls its body', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../src/renderer/settings.css'), 'utf8')

  assert.match(css, /\.settings-panel\s*{[\s\S]*max-height:\s*calc\(100vh - 32px\)/)
  assert.match(css, /\.settings-panel\s*{[\s\S]*overflow:\s*hidden/)
  assert.match(css, /\.settings-body\s*{[\s\S]*overflow-y:\s*auto/)
  assert.match(css, /\.settings-panel\[data-settings-mode="global"\]\s+\.settings-body\s*{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /@media \(max-width: 680px\)/)
})
