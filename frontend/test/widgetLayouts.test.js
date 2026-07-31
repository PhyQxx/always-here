const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadLayouts() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/utils/widgetLayouts.mjs'))
  return import(moduleUrl.href)
}

test('pickLayoutForScreen returns wide layout for width >= 1600', async () => {
  const { pickLayoutForScreen } = await loadLayouts()
  const layout = pickLayoutForScreen(1920)
  // 宽屏布局沿用原坐标:clock 在左上,note 在右上(920)
  assert.equal(layout.clock.x, 72)
  assert.equal(layout.note.x, 920)
  assert.equal(layout.wageman.x, 900)
})

test('pickLayoutForScreen returns compact layout for width < 1600', async () => {
  const { pickLayoutForScreen } = await loadLayouts()
  const layout = pickLayoutForScreen(1366)
  // 紧凑布局:两列排布,note 不再贴边在 920
  assert.equal(layout.clock.x, 40)
  assert.equal(layout.note.x, 720)
  assert.ok(layout.note.x < 920, 'compact layout should pull note away from edge')
})

test('pickLayoutForScreen uses 1600 as breakpoint', async () => {
  const { pickLayoutForScreen } = await loadLayouts()
  // 恰好 1600 → 宽屏
  assert.equal(pickLayoutForScreen(1600).clock.x, 72)
  // 1599 → 紧凑
  assert.equal(pickLayoutForScreen(1599).clock.x, 40)
})

test('pickLayoutForScreen handles invalid width by returning compact', async () => {
  const { pickLayoutForScreen } = await loadLayouts()
  assert.equal(pickLayoutForScreen(NaN).clock.x, 40)
  assert.equal(pickLayoutForScreen(undefined).clock.x, 40)
})

test('compact layout coordinates keep widgets within a 1366 screen width', async () => {
  const { pickLayoutForScreen } = await loadLayouts()
  const layout = pickLayoutForScreen(1366)
  // 所有 x 坐标都应在 1366 宽屏内(留 200px 给 widget 宽度)
  for (const key in layout) {
    assert.ok(layout[key].x < 1366 - 200, `${key} x=${layout[key].x} too close to edge on 1366`)
    assert.ok(layout[key].y < 800, `${key} y=${layout[key].y} too low on 800-height screen`)
  }
})
