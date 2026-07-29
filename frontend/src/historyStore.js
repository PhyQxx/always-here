const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024

function archiveSortKey(name) {
  return name.replace(/(?:\.(\d+))?\.jsonl$/i, (_match, suffix) => {
    return `.${String(Number(suffix || 0)).padStart(8, '0')}`
  })
}

function createHistoryStore(filePath, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const archiveBase = filePath.replace(/\.jsonl$/i, '')

  function nextArchivePath() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    let candidate = `${archiveBase}.${timestamp}.jsonl`
    let suffix = 1
    while (fs.existsSync(candidate)) {
      candidate = `${archiveBase}.${timestamp}.${suffix}.jsonl`
      suffix += 1
    }
    return candidate
  }

  function rotateIfNeeded(nextBytes) {
    if (!fs.existsSync(filePath)) return
    const currentBytes = fs.statSync(filePath).size
    if (currentBytes + nextBytes <= maxBytes) return
    fs.renameSync(filePath, nextArchivePath())
  }

  function append(entry) {
    const text = typeof entry?.text === 'string' ? entry.text.trim() : ''
    if (!text) return false

    const record = {
      version: 1,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
      text
    }
    const line = JSON.stringify(record) + '\n'
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    rotateIfNeeded(Buffer.byteLength(line))
    fs.appendFileSync(filePath, line, 'utf8')
    return true
  }

  function findLatest(predicate = () => true) {
    if (!fs.existsSync(path.dirname(filePath))) return null
    const archivePrefix = path.basename(archiveBase) + '.'
    const archives = fs.readdirSync(path.dirname(filePath))
      .filter((name) => name !== path.basename(filePath) && name.startsWith(archivePrefix) && name.endsWith('.jsonl'))
      .sort((a, b) => archiveSortKey(a).localeCompare(archiveSortKey(b)))
      .reverse()
      .map((name) => path.join(path.dirname(filePath), name))
    const candidates = [filePath, ...archives]

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue
      const lines = fs.readFileSync(candidate, 'utf8').trim().split('\n').reverse()
      for (const line of lines) {
        if (!line) continue
        try {
          const record = JSON.parse(line)
          if (predicate(record)) return record
        } catch {
          // 跳过单条损坏记录，继续查找更早的有效记录。
        }
      }
    }
    return null
  }

  function list({ predicate = () => true, since = null, limit = 500 } = {}) {
    if (!fs.existsSync(path.dirname(filePath))) return []
    const archivePrefix = path.basename(archiveBase) + '.'
    const files = fs.readdirSync(path.dirname(filePath))
      .filter((name) => name !== path.basename(filePath) && name.startsWith(archivePrefix) && name.endsWith('.jsonl'))
      .sort((a, b) => archiveSortKey(a).localeCompare(archiveSortKey(b)))
      .map((name) => path.join(path.dirname(filePath), name))
    if (fs.existsSync(filePath)) files.push(filePath)

    const sinceMs = since ? new Date(since).getTime() : null
    const records = []
    for (const candidate of files) {
      const lines = fs.readFileSync(candidate, 'utf8').split('\n')
      for (const line of lines) {
        if (!line) continue
        try {
          const record = JSON.parse(line)
          const timestampMs = new Date(record.timestamp).getTime()
          if (Number.isFinite(sinceMs) && (!Number.isFinite(timestampMs) || timestampMs < sinceMs)) continue
          if (predicate(record)) records.push(record)
        } catch {
          // 单条损坏记录不应阻塞其余历史读取。
        }
      }
    }
    records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.round(limit)) : 500
    return records.slice(-safeLimit)
  }

  return { append, findLatest, list, filePath }
}

module.exports = { createHistoryStore, DEFAULT_MAX_BYTES }
