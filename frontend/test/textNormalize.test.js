const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const test = require('node:test')

async function loadTextNormalize() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/renderer/utils/textNormalize.mjs'))
  return import(moduleUrl.href)
}

test('normalizePrompt strips leading/trailing punctuation and lowercases', async () => {
  const { normalizePrompt } = await loadTextNormalize()

  // 首尾的标点(含全角冒号、句号、省略号里的句点)应被剥离(镜像服务端 textUtils 行为)
  assert.equal(normalizePrompt('你刚看到用户的屏幕：...。'), '你刚看到用户的屏幕')
  assert.equal(normalizePrompt('你好！'), '你好')
  assert.equal(normalizePrompt('Hello, World.'), 'hello, world')
  // 中间的标点保留,只剥首尾
  assert.equal(normalizePrompt('你好,世界。'), '你好,世界')
})

test('normalizePrompt makes differing-only-by-edge-punctuation strings equal', async () => {
  const { normalizePrompt } = await loadTextNormalize()

  // 这是 P1-2 的核心场景:登记的内部指令与服务端回显 stt 仅尾标点不同时必须匹配,
  // 否则内部指令会被当作用户发言泄漏进气泡。
  const registered = normalizePrompt('跟我打个招呼吧')
  const echoed = normalizePrompt('跟我打个招呼吧。')
  assert.equal(registered, echoed)
})

test('normalizePrompt handles empty / null / whitespace-only input', async () => {
  const { normalizePrompt } = await loadTextNormalize()

  assert.equal(normalizePrompt(''), '')
  assert.equal(normalizePrompt(null), '')
  assert.equal(normalizePrompt(undefined), '')
  assert.equal(normalizePrompt('   '), '')
  assert.equal(normalizePrompt('，。！'), '')
})
