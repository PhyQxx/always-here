const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('settings panel layout stays inside the viewport and scrolls its body', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../src/renderer/settings.css'), 'utf8')

  assert.match(css, /\.settings-panel\s*{[\s\S]*height:\s*min\(600px,\s*calc\(100vh - 64px\)\)/)
  assert.match(css, /\.settings-panel\s*{[\s\S]*overflow:\s*hidden/)
  assert.match(css, /\.settings-body\s*{[\s\S]*overflow-y:\s*auto/)
  assert.match(css, /\.settings-tabs\s*{[\s\S]*display:\s*flex/)
  assert.match(css, /\.settings-tab-content\s*{[\s\S]*display:\s*none/)
  assert.match(css, /\.settings-tab-content\.active\s*{[\s\S]*display:\s*block/)
  assert.match(css, /@media \(max-width: 680px\)/)
})
