// Opus 下行解码器封装(主进程,Node 侧)
//
// 用 opus-decoder(纯 WASM,作者 Ethan Halsall / wasm-audio-decoders)。
// 该库是 ESM-only,主进程是 CommonJS,故用 dynamic import() 加载。
//
// 服务端下行音频:24kHz / 单声道 / 60ms 原始 Opus 帧(无 Ogg 容器)。
// 解码输出:Float32 PCM。累积若干帧后批量回调,减少 IPC 频率。

const FLUSH_FRAME_COUNT = 4 // 每累积 4 帧(240ms)回调一次,平衡延迟与 IPC 开销

let DecoderClass = null
let decoder = null
let pendingFloat32 = [] // 累积的 Float32 样本
let pendingCount = 0
let onChunkCallback = null

async function ensureDecoder() {
  if (decoder) return decoder
  if (!DecoderClass) {
    const mod = await import('opus-decoder')
    DecoderClass = mod.OpusDecoder
  }
  decoder = new DecoderClass({ sampleRate: 24000, channels: 1 })
  await decoder.ready
  return decoder
}

// 重置解码器状态(新一轮 TTS 开始时调用,清空内部状态)
async function resetDecoder() {
  pendingFloat32 = []
  pendingCount = 0
  if (decoder) {
    try { await decoder.reset() } catch { /* noop */ }
  }
}

// 解码一个 Opus 帧,累积到缓冲区;达到阈值则回调 flush
async function decodeFrame(opusBuffer) {
  try {
    const d = await ensureDecoder()
    const result = d.decodeFrame(opusBuffer)
    if (result && result.samplesDecoded > 0 && result.channelData) {
      pendingFloat32.push(result.channelData[0]) // 单声道取第 0 通道
      pendingCount++
      if (pendingCount >= FLUSH_FRAME_COUNT) {
        flush()
      }
    }
  } catch {
    // 个别帧解码失败不影响整体
  }
}

// 把累积的 Float32 合并成一个块,经回调送出
function flush() {
  if (pendingFloat32.length === 0) return
  const merged = concatFloat32(pendingFloat32)
  pendingFloat32 = []
  pendingCount = 0
  if (onChunkCallback) {
    // Float32Array 经 IPC 会损失类型,转成普通数组传输(渲染进程重建)
    onChunkCallback(merged)
  }
}

function concatFloat32(arrays) {
  let total = 0
  for (const a of arrays) total += a.length
  const result = new Float32Array(total)
  let offset = 0
  for (const a of arrays) {
    result.set(a, offset)
    offset += a.length
  }
  return result
}

function setOnChunk(callback) {
  onChunkCallback = callback
}

function destroy() {
  flush()
  if (decoder) {
    try { decoder.destroy() } catch { /* noop */ }
    decoder = null
  }
}

module.exports = {
  decodeFrame,
  resetDecoder,
  flush,
  setOnChunk,
  destroy
}
