const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, dialog, Notification, shell, session, globalShortcut, desktopCapturer } = require('electron')
const path = require('path')
const fs = require('fs')
const { randomUUID } = require('crypto')
const { APP_ICON_PNG_PATH, TRAY_ICON_PNG_PATH, getNotificationOptions } = require('./appIcon')
const https = require('https')
const { CODEX_PETS_DIR, getPetSpritesheetDataUrl, importCodexPetPackage, isInside, listPets } = require('./petStore')
const { initUpdater, checkHotUpdate } = require('./updater')
const { createXiaozhiClient } = require('./voice/xiaozhiClient')
const opusDecoder = require('./voice/opusDecoder')

// 轻量 LLM 直调参数(用于"看屏幕判断要不要说话",不经过小智服务端)
// 与小智服务端 config.yaml 的 MimoLLM 保持一致
const MIMO_CHAT_URL = 'https://api.xiaomimimo.com/v1/chat/completions'
const MIMO_API_KEY = 'sk-cuv11084hfrun4l7kdj1oyjolyhiftsvs7ioivht8r5wlo1b'
const MIMO_MODEL = 'mimo-v2.5-pro-ultraspeed'

const PET_CHAT_TONES = [
  { id: 'companion', label: '陪伴型' },
  { id: 'focus', label: '效率型' },
  { id: 'snark', label: '吐槽型' },
  { id: 'offwork', label: '下班提醒型' }
]

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')

const DEFAULT_CONFIG = {
  configVersion: 1,
  widgets: {
    clock: { enabled: true, x: 50, y: 50 },
    pet: { enabled: true, x: 300, y: 400 },
    timer: { enabled: true, x: 50, y: 200 },
    note: { enabled: true, x: 600, y: 50 },
    wageman: { enabled: true, x: 600, y: 350 }
  },
  alwaysOnTop: true,
  opacity: 1.0,
  globalScale: 1.0,
  theme: 'dark',
  autoStart: false,
  petId: 'hina',
  petFolderPath: CODEX_PETS_DIR,
  reminders: {
    hourly: { enabled: true, systemNotification: false },
    water: { enabled: true, intervalMinutes: 30, systemNotification: false },
    sedentary: { enabled: true, intervalMinutes: 60, systemNotification: false },
    work: { enabled: true, systemNotification: false }
  },
  petChat: {
    enabled: true,
    intervalMinutes: 1,
    quietMode: false,
    tone: 'companion'
  },
  voice: {
    enabled: false,
    serverUrl: 'ws://127.0.0.1:8000/xiaozhi/v1/',
    deviceId: '',
    clientId: '',
    token: '',
    triggerKey: 'CommandOrControl+Shift+Space',
    autoPlayTTS: true,
    bubbleDurationMs: 8000
  },
  vision: {
    enabled: false,           // 看屏幕说话总开关(隐私敏感,默认关)
    autoIntervalMinutes: 0    // 定时看屏幕间隔,0=关闭定时
  },
  happiness: 70,
  noteText: '',
  noteTranslucent: false,
  wageman: {
    clockIn: '09:00',
    clockOut: '17:00',
    monthlySalary: '8000',
    workDays: '',
    workDaysAuto: true,
    offWorkStops: {}
  }
}

function deepMerge(target, source) {
  const result = { ...target }
  for (const key in source) {
    const sv = source[key]
    const tv = target[key]
    if (
      sv && typeof sv === 'object' && !Array.isArray(sv) &&
      tv && typeof tv === 'object' && !Array.isArray(tv)
    ) {
      result[key] = deepMerge(tv, sv)
    } else {
      result[key] = sv
    }
  }
  return result
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return deepMerge(DEFAULT_CONFIG, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')))
    }
  } catch (e) {
    console.error('Failed to load config:', e)
  }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  } catch (e) {
    console.error('Failed to save config:', e)
  }
}

function getConfiguredPetFolder() {
  const config = loadConfig()
  return config.petFolderPath || CODEX_PETS_DIR
}

let mainWindow = null
let tray = null

function sendToRenderer(channel, payload, options = {}) {
  if (!mainWindow) return
  if (options.reveal && !mainWindow.isVisible()) {
    mainWindow.showInactive()
  }
  mainWindow.webContents.send(channel, payload)
}

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  const config = loadConfig()

  mainWindow = new BrowserWindow({
    width: screenW,
    height: screenH,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    resizable: false,
    icon: APP_ICON_PNG_PATH,
    alwaysOnTop: config.alwaysOnTop,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.setIgnoreMouseEvents(true, { forward: true })
  mainWindow.setVisibleOnAllWorkspaces(true)
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  mainWindow.showInactive()

  mainWindow.on('closed', () => { mainWindow = null })
}

function createTray() {
  const icon = nativeImage.createFromPath(TRAY_ICON_PNG_PATH)
  const trayIcon = process.platform === 'win32' ? icon.resize({ width: 16, height: 16 }) : icon

  tray = new Tray(trayIcon)
  tray.setToolTip('Always Here')
  tray.on('click', () => toggleVisibility())
  refreshTrayMenu()
}

function toggleVisibility() {
  if (!mainWindow) return
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
  }
  refreshTrayMenu()
}

function refreshTrayMenu() {
  if (!tray) return
  const config = loadConfig()
  const quietMode = Boolean(config.petChat?.quietMode)
  const isVisible = mainWindow?.isVisible()
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Always Here', enabled: false },
    { type: 'separator' },
    {
      label: '设置',
      click: () => sendToRenderer('show-settings', null, { reveal: true })
    },
    {
      label: '宠物说一句',
      submenu: [
        {
          label: '直接说',
          click: () => sendToRenderer('tray-command', { type: 'pet-say-now' }, { reveal: true })
        },
        { type: 'separator' },
        ...PET_CHAT_TONES.map(tone => ({
          label: `以 ${tone.label} 语气说`,
          click: () => sendToRenderer('tray-command', { type: 'pet-say-now', tone: tone.id }, { reveal: true })
        }))
      ]
    },
    {
      label: '安静模式',
      type: 'checkbox',
      checked: quietMode,
      click: () => sendToRenderer('tray-command', 'toggle-pet-quiet-mode')
    },
    {
      label: '行为记录',
      click: () => sendToRenderer('tray-command', 'show-activity', { reveal: true })
    },
    { type: 'separator' },
    {
      label: '看一眼屏幕 👀',
      click: () => sendToRenderer('tray-command', { type: 'vision-look' }, { reveal: true })
    },
    { type: 'separator' },
    { label: isVisible ? '隐藏' : '显示', click: () => toggleVisibility() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ])
  tray.setContextMenu(contextMenu)
}

// IPC handlers
ipcMain.handle('get-config', () => loadConfig())
ipcMain.handle('save-config', (_, config) => {
  saveConfig(config)
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(config.alwaysOnTop)
  }
  refreshTrayMenu()
})
ipcMain.handle('set-click-through', (_, ignore) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(ignore, { forward: true })
  }
})
ipcMain.handle('get-screen-size', () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  return { width, height }
})
ipcMain.handle('set-auto-start', (_, enable) => {
  app.setLoginItemSettings({ openAtLogin: enable })
})
ipcMain.handle('get-auto-start', () => {
  return app.getLoginItemSettings().openAtLogin
})
ipcMain.handle('list-pets', () => listPets(getConfiguredPetFolder()))
ipcMain.handle('get-pet-spritesheet', (_, petId) => getPetSpritesheetDataUrl(getConfiguredPetFolder(), petId))
ipcMain.handle('choose-pet-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择宠物文件夹',
    defaultPath: getConfiguredPetFolder(),
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})
ipcMain.handle('open-external-url', (_, url) => {
  if (url !== 'https://codex-pets.net/') return false
  shell.openExternal(url)
  return true
})
ipcMain.handle('import-pet-package', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入宠物包',
    filters: [
      { name: 'Codex 宠物包', extensions: ['zip'] },
      { name: 'ZIP 压缩包', extensions: ['zip'] }
    ],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths.length) return null
  return importCodexPetPackage(getConfiguredPetFolder(), result.filePaths[0])
})
ipcMain.handle('export-activity-log', async (_, csvText) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出行为记录',
    defaultPath: `always-here-activity-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'CSV 文件', extensions: ['csv'] }]
  })
  if (result.canceled || !result.filePath) return null
  fs.writeFileSync(result.filePath, `\ufeff${csvText}`, 'utf8')
  return result.filePath
})
ipcMain.handle('show-notification', (_, payload) => {
  if (!Notification.isSupported()) return false
  new Notification(getNotificationOptions(payload)).show()
  return true
})
ipcMain.handle('fetch-holidays', async (_, year) => {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 5000)
    https.get(`https://timor.tech/api/holiday/year/${year}`, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        clearTimeout(timeout)
        try { resolve(JSON.parse(body)) } catch { resolve(null) }
      })
    }).on('error', () => { clearTimeout(timeout); resolve(null) })
  })
})

ipcMain.handle('open-pet-folder', (_, petId) => {
  const config = loadConfig()
  const folder = petId ? path.join(config.petFolderPath || CODEX_PETS_DIR, petId) : (config.petFolderPath || CODEX_PETS_DIR)
  if (fs.existsSync(folder)) {
    shell.openPath(folder)
    return true
  }
  return false
})
ipcMain.handle('delete-pet', async (_, petId) => {
  const config = loadConfig()
  const root = config.petFolderPath || CODEX_PETS_DIR
  const petDir = path.join(root, petId)
  if (fs.existsSync(petDir) && isInside(root, petDir)) {
    fs.rmSync(petDir, { recursive: true, force: true })
    return true
  }
  return false
})
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('reset-config', () => {
  try {
    saveConfig(DEFAULT_CONFIG)
    return true
  } catch (e) {
    return false
  }
})

ipcMain.handle('check-hot-update', async () => {
  if (!app.isPackaged) return { error: '开发环境不支持热更新' }
  try {
    await checkHotUpdate(mainWindow)
    return { success: true }
  } catch (err) {
    return { error: err.message || '更新检查失败' }
  }
})

// ── 语音 / 小智对话 ──────────────────────────────────────────────
// 全局唯一的客户端实例;按当前 config.voice 建立连接,下行事件经 IPC 推给渲染进程
let voiceClient = null
let voiceCurrentConfig = null

function normalizeVoiceConfig(input = {}) {
  const fallback = DEFAULT_CONFIG.voice
  const str = (v, f) => (typeof v === 'string' && v.trim() ? v.trim() : f)
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : fallback.enabled,
    serverUrl: str(input.serverUrl, fallback.serverUrl),
    deviceId: str(input.deviceId, ''),
    clientId: str(input.clientId, ''),
    token: typeof input.token === 'string' ? input.token.trim() : '',
    triggerKey: str(input.triggerKey, fallback.triggerKey),
    autoPlayTTS: typeof input.autoPlayTTS === 'boolean' ? input.autoPlayTTS : fallback.autoPlayTTS,
    bubbleDurationMs: Number.isFinite(input.bubbleDurationMs)
      ? Math.max(2000, Math.round(input.bubbleDurationMs))
      : fallback.bubbleDurationMs
  }
}

function ensureVoiceDeviceIds(config) {
  // 首次使用生成持久 device-id / client-id 并落盘
  let changed = false
  if (!config.voice.deviceId) {
    config.voice.deviceId = randomUUID()
    changed = true
  }
  if (!config.voice.clientId) {
    config.voice.clientId = randomUUID()
    changed = true
  }
  if (changed) saveConfig(config)
  return config
}

function normalizeVisionConfig(input = {}) {
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : false,
    autoIntervalMinutes: Number.isFinite(input.autoIntervalMinutes)
      ? Math.max(0, Math.round(input.autoIntervalMinutes))
      : 0
  }
}

// 下行事件统一出口:拦截音频/tts 事件做解码,其余原样转发给渲染进程
function voiceEmit(event) {
  if (!mainWindow) return
  switch (event.type) {
    case 'audio':
      // Opus 帧解码(异步),累积后批量发渲染进程播放
      opusDecoder.decodeFrame(event.data)
      break
    case 'tts':
      if (event.state === 'start') {
        // 新一轮 TTS:重置解码器,清空上一轮残留
        opusDecoder.resetDecoder()
      } else if (event.state === 'stop') {
        // TTS 结束:flush 残余解码帧,确保播放完整
        opusDecoder.flush()
      }
      // tts 控制事件原样转发(start/sentence_start/stop)
      mainWindow.webContents.send('voice-event', event)
      break
    case 'status':
      // 断开时 flush 残余音频 + 通知渲染进程停止播放
      if (event.state === 'disconnected' || event.state === 'error') {
        opusDecoder.flush()
        mainWindow.webContents.send('voice-event', { type: 'tts', state: 'stop' })
      }
      mainWindow.webContents.send('voice-event', event)
      break
    default:
      mainWindow.webContents.send('voice-event', event)
  }
}

// 解码后的 PCM 块回调:发专门的音频通道给渲染进程
opusDecoder.setOnChunk((float32Array) => {
  if (!mainWindow) return
  // Float32Array 经 structured clone 可直接传,渲染进程拿到后用 AudioBufferSourceNode 播放
  mainWindow.webContents.send('voice-event', {
    type: 'audio-chunk',
    samples: float32Array,
    sampleRate: 24000
  })
})

function voiceConnect() {
  const config = ensureVoiceDeviceIds(loadConfig())
  voiceCurrentConfig = normalizeVoiceConfig(config.voice)
  // 已有连接先断开
  if (voiceClient) {
    try { voiceClient.disconnect() } catch { /* noop */ }
    voiceClient = null
  }
  voiceClient = createXiaozhiClient({ voiceConfig: voiceCurrentConfig, onEvent: voiceEmit })
  voiceClient.connect()
}

function voiceDisconnect() {
  if (voiceClient) {
    try { voiceClient.disconnect() } catch { /* noop */ }
    voiceClient = null
  }
  opusDecoder.flush()
  opusDecoder.destroy()
}

ipcMain.handle('voice-connect', async () => {
  const config = ensureVoiceDeviceIds(loadConfig())
  const voice = normalizeVoiceConfig(config.voice)
  if (!voice.enabled) return { ok: false, error: '语音未启用' }
  voiceConnect()
  return { ok: true }
})
ipcMain.handle('voice-disconnect', async () => {
  voiceDisconnect()
  return { ok: true }
})
// 文字对话(M2):注入文本,服务端走 LLM→TTS
ipcMain.handle('voice-send-text', async (_, text) => {
  if (!voiceClient || !voiceClient.isConnected) {
    // 懒连接:首次发送时自动建立
    voiceConnect()
    // 等 hello 到位再发(最多重试几次)
    for (let i = 0; i < 40 && (!voiceClient || !voiceClient.isConnected); i++) {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  if (!voiceClient || !voiceClient.isConnected) {
    return { ok: false, error: '未连接到小智服务端' }
  }
  const sent = voiceClient.sendText(text)
  return { ok: sent }
})
ipcMain.handle('voice-abort', async () => {
  if (voiceClient) voiceClient.abort()
  return { ok: true }
})
ipcMain.handle('voice-status', async () => {
  return { connected: Boolean(voiceClient && voiceClient.isConnected) }
})
// M5 起:渲染进程采集 PCM 后经此上行(由主进程编码,见 opusCodec.js)
ipcMain.handle('voice-send-audio', async (_, frame) => {
  if (!voiceClient) return { ok: false }
  // frame 可能是 ArrayBuffer/TypedArray/number[];统一成 Buffer
  const buf = Buffer.from(frame)
  return { ok: voiceClient.sendAudio(buf) }
})
ipcMain.handle('voice-start-listen', async (_, mode = 'auto') => {
  if (!voiceClient || !voiceClient.isConnected) voiceConnect()
  if (!voiceClient) return { ok: false, error: '未连接' }
  return { ok: voiceClient.startListen(mode) }
})
ipcMain.handle('voice-stop-listen', async () => {
  if (!voiceClient) return { ok: false }
  return { ok: voiceClient.stopListen() }
})

// ── 看屏幕说话(视觉) ────────────────────────────────────────────
// 流程:desktopCapturer 截屏 → JPEG → POST 到小智视觉接口(8003)→ 智谱看图
//       → 得到屏幕描述 → 作为 prompt 发给小智 LLM 让宠物说话
// 隐私:截屏会发送到智谱服务器,默认关闭,需用户在设置显式开启。
let visionTimer = null

// 截屏并调用小智视觉接口,返回 {ok, description?}
async function captureAndDescribe() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 }
    })
    if (!sources.length) return { ok: false, error: '无法获取屏幕' }
    const thumb = sources[0].thumbnail
    const jpegBuffer = thumb.toJPEG(70) // 质量 70,平衡清晰度与体积
    if (!jpegBuffer || jpegBuffer.length === 0) return { ok: false, error: '截屏为空' }

    // POST multipart 到小智视觉接口(用 web_test_client 跳过本地 token 认证)
    const description = await postVisionExplain(jpegBuffer)
    if (!description) return { ok: false, error: '视觉识别无结果' }
    return { ok: true, description }
  } catch (e) {
    return { ok: false, error: e.message || '截屏失败' }
  }
}

// 构造 multipart/form-data 并 POST 到 8003 视觉接口
function postVisionExplain(jpegBuffer) {
  return new Promise((resolve) => {
    const boundary = '----ahvision' + Date.now()
    const question = '简要描述用户当前屏幕上主要在做什么(如写代码/看视频/聊天/浏览网页等),一句话。'
    // multipart body
    const parts = []
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="question"\r\n\r\n${question}\r\n`))
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="screen.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`))
    parts.push(jpegBuffer)
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
    const body = Buffer.concat(parts)

    const http = require('http')
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8003,
      path: '/mcp/vision/explain',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'Client-Id': 'web_test_client',
        'Device-Id': 'always-here-desktop'
      }
    }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(json.success ? json.response : null)
        } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(15000, () => { req.destroy(); resolve(null) })
    req.write(body)
    req.end()
  })
}

// 一次完整的"看屏幕说话":截屏 → 描述 → 让小智基于描述生成宠物台词
ipcMain.handle('vision-look-and-say', async () => {
  const result = await captureAndDescribe()
  if (!result.ok) {
    voiceEmit({ type: 'vision-error', message: result.error })
    return { ok: false, error: result.error }
  }
  // 把屏幕描述作为 prompt 发给小智,让它以宠物口吻评论
  const prompt = `你刚看到用户的屏幕:${result.description}。以桌面陪伴宠物的口吻,用一句话(20字以内)自然地评论或关心一下,不要太机械。`
  const sent = await sendToXiaozhiIfConnected(prompt)
  if (sent) {
    voiceEmit({ type: 'vision-description', description: result.description })
    return { ok: true, description: result.description }
  }
  return { ok: false, error: '未连接小智' }
})

// 定时看屏幕:AI 自主决定要不要说话(大部分时候安静)
// 先用轻量 LLM 判断(直接调 mimo,不触发 TTS),决定说才走完整小智链路
ipcMain.handle('vision-check-and-maybe-say', async () => {
  const result = await captureAndDescribe()
  if (!result.ok) return { ok: false, decided: false }

  // 第一步:轻量判断 —— 直接调 mimo LLM(不经小智 TTS),问"要不要说话 + 说什么"
  const judgePrompt = `你是桌面陪伴宠物,刚看到用户屏幕:${result.description}。
判断现在适不适合主动搭一句话。规则:专注工作时通常不打扰;摸鱼/休息/发呆时可以搭话;大部分时候选择安静。
如果你决定说:直接回复要说的话(15字以内,自然不机械)。
如果你决定不说:只回复 SILENT。`
  const judgeResult = await askMimoLlm(judgePrompt)

  // 决定安静 → 什么都不做,不触发任何声音/气泡
  if (!judgeResult || judgeResult.toUpperCase().includes('SILENT')) {
    return { ok: true, decided: false }
  }

  // 决定说话 → 让小智说 AI 判断好的那句话(走完整链路:声音 + 气泡 + 动画)
  const said = await sendToXiaozhiIfConnected(`请直接重复这句话,不加任何其它内容:${judgeResult}`)
  return { ok: said, decided: true }
})

// 直接调 mimo LLM(不经过小智服务端,不触发 TTS),返回原始文本
// 用于"判断要不要说话"这种轻量决策
// 注意:mimo 是推理模型,reasoning_tokens 不计入 content,max_tokens 要给足
// (推理常消耗 200-300 tokens,给 500 保证 content 能正常输出)
function askMimoLlm(prompt) {
  const https = require('https')
  const body = JSON.stringify({
    model: MIMO_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 500
  })
  return new Promise((resolve) => {
    const req = https.request(MIMO_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MIMO_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(json.choices?.[0]?.message?.content?.trim() || null)
        } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(15000, () => { req.destroy(); resolve(null) })
    req.write(body)
    req.end()
  })
}

// 辅助:确保小智已连接后发文本
async function sendToXiaozhiIfConnected(text) {
  if (voiceClient && voiceClient.isConnected) {
    voiceClient.sendText(text)
    return true
  }
  voiceConnect()
  for (let i = 0; i < 20 && (!voiceClient || !voiceClient.isConnected); i++) {
    await new Promise((r) => setTimeout(r, 100))
  }
  if (voiceClient && voiceClient.isConnected) {
    voiceClient.sendText(text)
    return true
  }
  return false
}

// 启停定时看屏幕
ipcMain.handle('vision-start-loop', async (_, intervalMinutes) => {
  stopVisionLoop()
  const mins = Math.max(1, Math.round(Number(intervalMinutes) || 10))
  visionTimer = setInterval(() => {
    // 定时触发:AI 自主决定要不要说话(不打扰专注中的用户)
    // 直接在主进程完成截屏+判断+说话,不经过渲染进程
    const config = normalizeVisionConfig(loadConfig().vision)
    if (!config.enabled) return
    captureAndDescribe().then((result) => {
      if (!result.ok) return
      const judgePrompt = `你是桌面陪伴宠物,刚看到用户屏幕:${result.description}。
判断现在适不适合主动搭一句话。规则:专注工作时通常不打扰;摸鱼/休息/发呆时可以搭话;大部分时候选择安静。
如果你决定说:直接回复要说的话(15字以内,自然不机械)。
如果你决定不说:只回复 SILENT。`
      askMimoLlm(judgePrompt).then((judgeResult) => {
        if (!judgeResult || judgeResult.toUpperCase().includes('SILENT')) return
        sendToXiaozhiIfConnected(`请直接重复这句话,不加任何其它内容:${judgeResult}`)
      })
    })
  }, mins * 60 * 1000)
  return { ok: true }
})

ipcMain.handle('vision-stop-loop', async () => {
  stopVisionLoop()
  return { ok: true }
})

function stopVisionLoop() {
  if (visionTimer) { clearInterval(visionTimer); visionTimer = null }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.always-here.app')
  }

  // 自动放行麦克风权限(语音功能需要 getUserMedia {audio})
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media')
  })

  createWindow()
  createTray()

  // 注册全局快捷键唤醒语音对话
  registerVoiceShortcut()

  // 启动看屏幕定时循环(若已启用)
  const initConfig = loadConfig()
  const visionCfg = normalizeVisionConfig(initConfig.vision)
  if (visionCfg.enabled && visionCfg.autoIntervalMinutes > 0) {
    ipcMain.invoke('vision-start-loop', visionCfg.autoIntervalMinutes)
  }

  // 初始化更新检查
  if (app.isPackaged) {
    initUpdater(mainWindow)
  }
})

function registerVoiceShortcut() {
  const config = loadConfig()
  const key = config.voice?.triggerKey
  if (!key) return
  try {
    globalShortcut.register(key, () => {
      sendToRenderer('tray-command', { type: 'voice-toggle' }, { reveal: true })
    })
  } catch (e) {
    console.warn('注册语音快捷键失败:', e)
  }
}

function unregisterVoiceShortcut() {
  try { globalShortcut.unregisterAll() } catch { /* noop */ }
}

// 重新注册快捷键(设置面板改了 triggerKey 后调用)
ipcMain.handle('voice-reregister-shortcut', async () => {
  unregisterVoiceShortcut()
  registerVoiceShortcut()
  return { ok: true }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  unregisterVoiceShortcut()
  voiceDisconnect()
  stopVisionLoop()
})

app.on('activate', () => {
  if (!mainWindow) createWindow()
})
