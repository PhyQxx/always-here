const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { createHistoryStore } = require('../src/historyStore')

test('history store appends structured JSONL records', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'always-here-history-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const filePath = path.join(dir, 'history.jsonl')
  const store = createHistoryStore(filePath)

  assert.equal(store.append({ category: 'conversation', role: 'user', text: ' 你好 ' }), true)
  assert.equal(store.append({ category: 'vision', source: 'manual', text: '正在编辑代码' }), true)

  const records = fs.readFileSync(filePath, 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(records.length, 2)
  assert.equal(records[0].text, '你好')
  assert.equal(records[0].category, 'conversation')
  assert.equal(records[1].category, 'vision')
  assert.ok(records[0].id)
  assert.ok(records[0].timestamp)
  assert.equal(store.findLatest((record) => record.category === 'vision').text, '正在编辑代码')
})

test('history store ignores empty text and preserves every rotated archive', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'always-here-history-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const filePath = path.join(dir, 'history.jsonl')
  const store = createHistoryStore(filePath, { maxBytes: 300 })

  assert.equal(store.append({ category: 'conversation', text: '   ' }), false)
  store.append({ category: 'conversation', text: 'a'.repeat(180) })
  store.append({ category: 'conversation', text: 'b'.repeat(180) })
  store.append({ category: 'conversation', text: 'c'.repeat(180) })

  const archives = fs.readdirSync(dir)
    .filter((name) => name !== 'history.jsonl' && name.startsWith('history.') && name.endsWith('.jsonl'))
    .sort()
  assert.equal(archives.length, 2)
  const archivedText = archives.map((name) => fs.readFileSync(path.join(dir, name), 'utf8')).join('\n')
  assert.match(archivedText, /aaaa/)
  assert.match(archivedText, /bbbb/)
  assert.match(fs.readFileSync(filePath, 'utf8'), /cccc/)
  assert.match(store.findLatest().text, /cccc/)
  assert.deepEqual(store.list({ limit: 2 }).map((record) => record.text), ['b'.repeat(180), 'c'.repeat(180)])
})

test('history store clear() removes all records when no category given', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'always-here-history-'))
  const file = path.join(dir, 'history.jsonl')
  const store = createHistoryStore(file)
  store.append({ category: 'conversation', role: 'user', text: 'hello' })
  store.append({ category: 'vision', text: 'screen content' })
  assert.equal(store.list().length, 2)

  const removed = store.clear()
  assert.ok(removed >= 2)
  assert.equal(store.list().length, 0)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('history store clear(category) removes only matching records', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'always-here-history-'))
  const file = path.join(dir, 'history.jsonl')
  const store = createHistoryStore(file)
  store.append({ category: 'conversation', role: 'user', text: 'keep me' })
  store.append({ category: 'vision', text: 'delete me' })

  const removed = store.clear('vision')
  assert.equal(removed, 1)
  const remaining = store.list()
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0].category, 'conversation')
  fs.rmSync(dir, { recursive: true, force: true })
})
