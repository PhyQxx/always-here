// 麦克风采集 AudioWorklet(替代已废弃的 createScriptProcessor)。
//
// 运行在音频线程(AudioWorkletProcessor),职责单一:把输入通道的 PCM 帧
// 经 port.postMessage 传回主线程,由 petVoice.mjs 收集后转 WAV 送 ASR。
//
// 不在此处做任何业务逻辑:主线程通过 port 向本 worklet 发 'stop' 可停止上报,
// 但真正断开由主线程 disconnect 节点完成。

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.active = true
    this.port.onmessage = (event) => {
      // 主线程通知停止上报(配合 disconnect)
      if (event.data === 'stop') this.active = false
    }
  }

  process(inputs) {
    if (!this.active) return true
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const channel = input[0]
    if (!channel || channel.length === 0) return true
    // 拷贝一份:postMessage 转移所有权后,音频线程的 buffer 会被复用
    this.port.postMessage(new Float32Array(channel))
    return true
  }
}

registerProcessor('pet-voice-capture-processor', CaptureProcessor)
