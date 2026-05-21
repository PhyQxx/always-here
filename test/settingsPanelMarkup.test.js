const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('settings panel rows declare scopes for widget-specific context menus', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../src/renderer/index.html'), 'utf8')
  const panelMatch = html.match(/<div id="settings-panel"[\s\S]*?<\/div>\s*<\/div>\s*<div id="activity-panel"/)

  assert.ok(panelMatch, 'settings panel markup should be present')
  const rows = panelMatch[0].match(/<div class="setting-row[^"]*"[^>]*>/g) || []

  assert.ok(rows.length > 0, 'settings panel should contain rows')
  assert.equal(rows.every(row => row.includes('data-settings-scope=')), true)
  assert.ok(rows.some(row => row.includes('data-settings-scope="pet wageman"')))
  assert.ok(html.includes('<h3 id="settings-title">设置</h3>'))
})
