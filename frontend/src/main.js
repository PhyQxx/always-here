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
const { createHistoryStore } = require('./historyStore')

const PET_CHAT_TONES = [
  { id: 'companion', label: '陪伴型' },
  { id: 'focus', label: '效率型' },
  { id: 'snark', label: '吐槽型' },
  { id: 'offwork', label: '下班提醒型' }
]

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')
const HISTORY_PATH = path.join(app.getPath('userData'), 'history.jsonl')
const historyStore = createHistoryStore(HISTORY_PATH)
const latestVisionHistory = historyStore.findLatest((record) => record.category === 'vision')
let lastVisionDescription = latestVisionHistory?.text || ''

function persistHistory(entry) {
  try {
    historyStore.append(entry)
  } catch (error) {
    console.error('[history] 写入失败:', error)
  }
}

const DEFAULT_CONFIG = {
  configVersion: 1,
  widgets: {
    clock: { enabled: true, x: 72, y: 58 },
    pet: { enabled: true, x: 560, y: 410 },
    timer: { enabled: true, x: 72, y: 560 },
    note: { enabled: true, x: 920, y: 78 },
    wageman: { enabled: true, x: 900, y: 550 }
  },
  alwaysOnTop: true,
  opacity: 1.0,
  globalScale: 1.0,
  theme: 'cozy',
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
    intervalMinutes: 10,
    quietMode: false,
    tone: 'companion'
  },
  voice: {
    enabled: false,
    serverUrl: 'ws://127.0.0.1:8000/xiaozhi/v1/',
    apiUrl: 'http://127.0.0.1:8003/',
    deviceId: '',
    clientId: '',
    token: '',
    triggerKey: 'CommandOrControl+Shift+Space',
    autoPlayTTS: true,
    bubbleDurationMs: 8000,
    ttsVoice: '冰糖'
  },
  vision: {
    enabled: false,            // 看屏幕说话总开关(隐私敏感,默认关)
    inactivitySeconds: 20      // 用户多久没有发消息后看屏幕并主动搭话,0=关闭
  },
  happiness: 70,
  lastActiveAt: null, // F8:上次与伙伴互动的时间戳(毫秒),用于好感度衰减
  lastRecapDate: null, // T1:上次今日回顾的日期 key(YYYY-M-D),一天最多一次
  hasOnboarded: false, // T3:是否完成首启引导(首次打开设置后置 true)
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
      label: '伙伴说一句',
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
    title: '选择伙伴文件夹',
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
    title: '导入伙伴包',
    filters: [
      { name: 'Codex 伙伴包', extensions: ['zip'] },
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

// T5:数据导出/导入(换机迁移)。打包 config + 全部 history 为单个 JSON 文件。
// 导入会覆盖现有数据,故需用户二次确认(由渲染进程 showConfirm 处理)。
ipcMain.handle('export-all-data', async () => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出我的数据',
      defaultPath: `always-here-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Always Here 备份', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }

    // 读取 config(当前内存值优先,否则读磁盘)
    const config = loadConfig()
    // 读取全部 history(含归档,limit 设大保证全量)
    const history = historyStore.list({ limit: 100000 })

    const backup = {
      appVersion: app.getVersion(),
      exportedAt: new Date().toISOString(),
      config,
      history
    }
    fs.writeFileSync(result.filePath, JSON.stringify(backup, null, 2), 'utf8')
    return { ok: true, path: result.filePath }
  } catch (e) {
    return { ok: false, error: e.message || '导出失败' }
  }
})

ipcMain.handle('import-all-data', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入数据(将覆盖现有)',
      filters: [{ name: 'Always Here 备份', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true }

    const raw = fs.readFileSync(result.filePaths[0], 'utf8')
    const backup = JSON.parse(raw)
    if (!backup || typeof backup !== 'object' || !backup.config) {
      return { ok: false, error: '备份文件格式无效' }
    }

    // 覆盖 config
    saveConfig(backup.config)
    // 覆盖 history:先全量清空,再逐条写入(保留归档滚动机制)
    historyStore.clear()
    if (Array.isArray(backup.history)) {
      for (const record of backup.history) {
        historyStore.append({
          category: record.category,
          role: record.role,
          source: record.source,
          text: record.text,
          // 保留原始时间戳(append 默认用当前时间,这里覆盖)
          timestamp: record.timestamp
        })
      }
    }
    return { ok: true, message: '导入成功,重启应用后完全生效' }
  } catch (e) {
    return { ok: false, error: e.message || '导入失败' }
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
  // serverUrl 统一补尾斜杠,与渲染进程 normalizeWsUrl 行为一致
  const normalizeWs = (v) => {
    const s = str(v, fallback.serverUrl)
    return s.endsWith('/') ? s : s + '/'
  }
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : fallback.enabled,
    serverUrl: normalizeWs(input.serverUrl),
    apiUrl: str(input.apiUrl, fallback.apiUrl).replace(/\/?$/, '/'),
    deviceId: str(input.deviceId, ''),
    clientId: str(input.clientId, ''),
    token: typeof input.token === 'string' ? input.token.trim() : '',
    triggerKey: str(input.triggerKey, fallback.triggerKey),
    autoPlayTTS: typeof input.autoPlayTTS === 'boolean' ? input.autoPlayTTS : fallback.autoPlayTTS,
    bubbleDurationMs: Number.isFinite(input.bubbleDurationMs)
      ? Math.max(2000, Math.round(input.bubbleDurationMs))
      : fallback.bubbleDurationMs,
    ttsVoice: str(input.ttsVoice, fallback.ttsVoice)
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

function getCurrentVoiceConfig() {
  return normalizeVoiceConfig(ensureVoiceDeviceIds(loadConfig()).voice)
}

function normalizeVisionConfig(input = {}) {
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : false,
    inactivitySeconds: Number.isFinite(input.inactivitySeconds)
      ? Math.max(0, Math.round(input.inactivitySeconds))
      : 20
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
        // AI 开始说话 → 对话进行中(刷新超时,因为接下来会持续有 tts 事件)
        markConversationActive('tts-start')
      } else if (event.state === 'stop') {
        // TTS 结束:flush 残余解码帧,确保播放完整
        opusDecoder.flush()
        // AI 说完话 → 对话结束
        markConversationIdle('tts-stop')
      } else if (event.state === 'sentence_start' && event.text) {
        // 长回复可能超过思考超时时间；每句都刷新状态，避免讲到一半被主动搭话打断。
        markConversationActive('tts-sentence')
        persistHistory({
          category: 'conversation',
          role: 'assistant',
          source: 'tts',
          text: event.text
        })
      }
      // tts 控制事件原样转发(start/sentence_start/stop)
      mainWindow.webContents.send('voice-event', event)
      break
    case 'status':
      // 断开时 flush 残余音频 + 通知渲染进程停止播放
      if (event.state === 'disconnected' || event.state === 'error') {
        opusDecoder.flush()
        mainWindow.webContents.send('voice-event', { type: 'tts', state: 'stop' })
        markConversationIdle(`voice-${event.state}`)
        // 自动重连(带指数退避,避免服务未启动时疯狂重试)
        scheduleReconnect()
      }
      if (event.state === 'connected') {
        resetReconnect()
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
  // 主动连接(用户触发或重连):清除"手动断开"标记,重置退避计数
  voiceManualDisconnect = false
  resetReconnect()
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
  // 手动断开:标记后重连逻辑不再触发
  voiceManualDisconnect = true
  resetReconnect()
  if (voiceClient) {
    try { voiceClient.disconnect() } catch { /* noop */ }
    voiceClient = null
  }
  opusDecoder.flush()
  opusDecoder.destroy()
}

// ── 断线自动重连(指数退避 + 上限) ──
let voiceManualDisconnect = false
let reconnectTimer = null
let reconnectAttempt = 0
const RECONNECT_DELAYS = [2000, 3000, 5000, 8000, 15000] // 指数退避,最长 15s
const MAX_RECONNECT_ATTEMPTS = 20 // G1:约 5 分钟后放弃,避免服务端长期不可用时无限重试

function resetReconnect() {
  reconnectAttempt = 0
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
}

function scheduleReconnect() {
  // 用户主动断开,或语音未启用,不重连
  if (voiceManualDisconnect) return
  const config = loadConfig()
  if (!normalizeVoiceConfig(config.voice).enabled) return
  if (reconnectTimer) return // 已有重连在排队

  // G1:超过最大重连次数,停止重试并通知用户(不再无限刷屏重连)
  if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
    voiceEmit({
      type: 'status',
      state: 'reconnect-given-up',
      message: `已连续重连 ${reconnectAttempt} 次仍失败,已停止。请检查服务端后重新开启语音。`
    })
    reconnectAttempt = 0
    return
  }

  const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)]
  reconnectAttempt++
  voiceEmit({ type: 'status', state: 'reconnecting', attempt: reconnectAttempt, delay })
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (voiceManualDisconnect) return
    // 重连(复用 voiceConnect,它会先断开旧连接)
    voiceManualDisconnect = false
    voiceConnect()
  }, delay)
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
async function sendVoiceText(text, { userMessage = false } = {}) {
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
  if (sent) {
    if (userMessage) {
      persistHistory({
        category: 'conversation',
        role: 'user',
        source: 'desktop-input',
        text
      })
      noteUserMessage()
    }
    // 发出消息后进入对话(AI 将思考并说话),期间不应主动搭话
    markConversationActive(userMessage ? 'user-message' : 'system-message')
  }
  return { ok: sent }
}

ipcMain.handle('voice-send-text', async (_, text) => {
  return sendVoiceText(text, { userMessage: true })
})
ipcMain.handle('voice-send-system-text', async (_, text) => {
  return sendVoiceText(text)
})
ipcMain.handle('voice-abort', async () => {
  if (voiceClient) voiceClient.abort()
  return { ok: true }
})
ipcMain.handle('voice-status', async () => {
  return { connected: Boolean(voiceClient && voiceClient.isConnected) }
})

function requestXiaozhiApi(pathname, body, contentType = 'application/json', timeoutMs = 20000) {
  return new Promise((resolve) => {
    const voice = getCurrentVoiceConfig()
    let url
    try {
      url = new URL(pathname.replace(/^\//, ''), voice.apiUrl)
    } catch {
      resolve({ success: false, message: '小智 HTTP 服务地址无效' })
      return
    }
    const transport = url.protocol === 'https:' ? require('https') : require('http')
    const headers = {
      'Content-Type': contentType,
      'Content-Length': body.length,
      'Device-Id': voice.deviceId,
      'Client-Id': voice.clientId
    }
    if (voice.token) headers.Authorization = `Bearer ${voice.token}`

    const req = transport.request(url, { method: 'POST', headers }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          resolve(res.statusCode >= 200 && res.statusCode < 300
            ? parsed
            : { success: false, message: parsed.message || `HTTP ${res.statusCode}` })
        } catch {
          resolve({ success: false, message: `小智服务响应异常（HTTP ${res.statusCode}）` })
        }
      })
    })
    req.on('error', () => resolve({ success: false, message: '无法连接小智 HTTP 服务' }))
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      resolve({ success: false, message: '小智 HTTP 服务请求超时' })
    })
    req.write(body)
    req.end()
  })
}

// 渲染进程采集麦克风并转成 WAV，模型调用统一交给 xiaozhi-server。
ipcMain.handle('voice-asr', async (_, wavBuffer) => {
  try {
    if (!wavBuffer || wavBuffer.length === 0) return { ok: false, error: '空音频' }
    const result = await requestXiaozhiApi(
      '/api/ai/asr',
      Buffer.from(wavBuffer),
      'audio/wav'
    )
    return result.success && result.text
      ? { ok: true, text: result.text }
      : { ok: false, error: result.message || '语音识别失败' }
  } catch (e) {
    return { ok: false, error: e.message || '语音识别失败' }
  }
})

function getConversationHistory({ days = 7, limit = 500 } = {}) {
  const numericDays = days === 'all' ? null : Math.max(1, Number(days) || 7)
  const since = numericDays ? new Date(Date.now() - numericDays * 86400000).toISOString() : null
  return historyStore.list({
    predicate: (record) => record.category === 'conversation' && ['user', 'assistant'].includes(record.role),
    since,
    limit: Math.min(Math.max(Number(limit) || 500, 1), 2000)
  })
}

ipcMain.handle('conversation-history', async (_, options = {}) => {
  try {
    return { ok: true, entries: getConversationHistory(options) }
  } catch (error) {
    return { ok: false, error: error.message || '读取对话记录失败', entries: [] }
  }
})

ipcMain.handle('conversation-summary', async (_, options = {}) => {
  try {
    const entries = getConversationHistory({ ...options, limit: 500 })
    if (!entries.length) return { ok: false, error: '当前范围内暂无对话' }
    const transcript = entries.map((entry) => {
      const speaker = entry.role === 'user' ? '用户' : '伙伴'
      return `${speaker}：${entry.text}`
    }).join('\n').slice(-16000)
    const body = Buffer.from(JSON.stringify({
      system_prompt: '你是对话整理助手。只根据给出的对话，用中文输出简洁、温暖且可执行的总结。不要虚构信息。',
      prompt: `请总结下面这段用户与桌面伙伴的对话。按“聊了什么、用户状态与偏好、待办或值得记住的事”组织；没有内容的栏目可省略。\n\n${transcript}`,
      max_tokens: 700
    }))
    const result = await requestXiaozhiApi('/api/ai/chat', body, 'application/json', 60000)
    return result.success && result.text
      ? { ok: true, text: result.text }
      : { ok: false, error: result.message || 'AI 总结失败' }
  } catch (error) {
    return { ok: false, error: error.message || 'AI 总结失败' }
  }
})

// 清空对话历史(category=conversation)
ipcMain.handle('conversation-clear', async () => {
  try {
    const removed = historyStore.clear('conversation')
    return { ok: true, removed }
  } catch (error) {
    return { ok: false, error: error.message || '清空对话历史失败' }
  }
})

// 视觉(屏幕观察)记录:查看 / 清空(隐私敏感数据,允许用户查看与删除)
// 复用下方 work-report 用的 getVisionHistory(函数声明提升,此处可提前引用)。
ipcMain.handle('vision-history', async (_, options = {}) => {
  try {
    return { ok: true, entries: getVisionHistory(options) }
  } catch (error) {
    return { ok: false, error: error.message || '读取屏幕观察记录失败', entries: [] }
  }
})

ipcMain.handle('vision-clear', async () => {
  try {
    const removed = historyStore.clear('vision')
    // 清空内存里的最新视觉描述缓存,避免下一次主动搭话基于已删除的旧描述
    lastVisionDescription = ''
    return { ok: true, removed }
  } catch (error) {
    return { ok: false, error: error.message || '清空屏幕观察记录失败' }
  }
})

// 屏幕识别记录(vision)：工作汇报日报/周报的数据来源
function getVisionHistory({ days = 1, limit = 1000 } = {}) {
  const numericDays = days === 'all' ? null : Math.max(1, Number(days) || 1)
  const since = numericDays ? new Date(Date.now() - numericDays * 86400000).toISOString() : null
  return historyStore.list({
    predicate: (record) => record.category === 'vision',
    since,
    limit: Math.min(Math.max(Number(limit) || 1000, 1), 2000)
  })
}

ipcMain.handle('work-report', async (_, options = {}) => {
  try {
    const entries = getVisionHistory({ days: options.range, limit: 1000 })
    if (!entries.length) return { ok: false, error: '该时间段没有屏幕识别记录' }
    // 每条按“【HH:MM】描述”组织，让模型感知时间分布；截断末尾 16000 字符以防超服务端上限
    const transcript = entries.map((entry) => {
      const time = new Date(entry.timestamp)
      const hh = String(time.getHours()).padStart(2, '0')
      const mm = String(time.getMinutes()).padStart(2, '0')
      return `【${hh}:${mm}】${entry.text}`
    }).join('\n').slice(-16000)
    const body = Buffer.from(JSON.stringify({
      system_prompt: '你是工作汇报助手。只根据给出的屏幕识别记录，用中文客观地整理成工作汇报，使用 Markdown 格式。不要虚构记录里没有的工作内容；如果记录不足以判断，就如实说明。合并相似事项，按主题归类，突出实际进展。',
      prompt: `请把下面这段时间的屏幕识别记录整理成一份简洁的工作汇报。要求：1) 按“今日工作内容、主要进展、遇到的问题、明日可关注的事项”分栏，没有内容的栏目省略；2) 每个条目用一句话精炼概括，合并重复或相似的事项，不要罗列每条原始记录；3) 整体控制在 600 字以内，确保内容完整不截断。\n\n${transcript}`,
      max_tokens: 2000
    }))
    const result = await requestXiaozhiApi('/api/ai/chat', body, 'application/json', 60000)
    return result.success && result.text
      ? { ok: true, text: result.text, count: entries.length }
      : { ok: false, error: result.message || '生成汇报失败' }
  } catch (error) {
    return { ok: false, error: error.message || '生成汇报失败' }
  }
})

// ── 看屏幕说话(视觉) ────────────────────────────────────────────
// 流程:desktopCapturer 截取所有屏幕 → 分别 POST 到小智视觉接口(8003)
//       → 合并每块屏幕的描述 → 作为 prompt 发给小智 LLM 让伙伴说话
// 隐私:截屏会发送到智谱服务器,默认关闭,需用户在设置显式开启。
let visionTimer = null
let visionCheckInFlight = false
let visionSilenceHandled = false
let silenceGeneration = 0
let visionTimerDueAt = null

function logVisionDecision(action, details = {}) {
  console.log(`[vision][decision] ${new Date().toISOString()} ${action} ${JSON.stringify(details)}`)
}
// 对话是否进行中(伙伴正在说话,或刚收到用户输入正在思考)。
// 未回复触发的主动搭话必须避开对话进行中的时刻,否则会打断当前对话。
let conversationActive = false
let conversationActiveTimer = null
// 用户发消息后,AI 还没开始说话的"思考期"也算对话进行中,超时后自动解除。
const CONVERSATION_THINKING_TIMEOUT_MS = 12000

// 标记对话开始(用户发消息 或 AI 开始说话)
function markConversationActive(reason = 'unknown') {
  conversationActive = true
  logVisionDecision('对话进行中', { reason })
  if (conversationActiveTimer) clearTimeout(conversationActiveTimer)
  conversationActiveTimer = setTimeout(() => {
    // 兜底:如果迟迟没等到 tts stop(网络异常/服务端没回),超时自动解除
    markConversationIdle('thinking-timeout')
  }, CONVERSATION_THINKING_TIMEOUT_MS)
}

// 标记对话结束(AI 说完话)
function markConversationIdle(reason = 'unknown') {
  conversationActive = false
  if (conversationActiveTimer) { clearTimeout(conversationActiveTimer); conversationActiveTimer = null }
  // 每次伙伴说完都开始新的 20 秒等待；用户仍不回复时可以继续主动搭话。
  visionSilenceHandled = false
  logVisionDecision('对话结束，重新等待用户回复', { reason })
  scheduleVisionSilenceCheck(undefined, `conversation-idle:${reason}`)
}

// 真实用户每发一条文字或语音消息，就开启一轮新的“等待回复”周期。
// 伙伴说完后会再等一个完整周期；用户仍未回复时可继续主动搭话。
function noteUserMessage() {
  silenceGeneration++
  visionSilenceHandled = false
  logVisionDecision('收到真实用户消息，重置倒计时', { generation: silenceGeneration })
  scheduleVisionSilenceCheck(undefined, 'user-message')
}

// 截取所有显示器并分别调用小智视觉接口,返回合并后的描述。
async function captureAndDescribe(source = 'manual') {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      // 提高分辨率，便于视觉模型识别窗口标题、代码、错误信息和页面文字。
      thumbnailSize: { width: 1920, height: 1080 }
    })
    if (!sources.length) return { ok: false, error: '无法获取屏幕' }
    logVisionDecision('已获取屏幕源', {
      count: sources.length,
      screens: sources.map((screenSource, index) => ({
        index: index + 1,
        name: screenSource.name,
        displayId: screenSource.display_id || null
      }))
    })

    const screenshots = sources.map((screenSource, index) => ({
      index,
      name: screenSource.name || `屏幕 ${index + 1}`,
      jpegBuffer: screenSource.thumbnail.toJPEG(80)
    }))
    if (screenshots.some(({ jpegBuffer }) => !jpegBuffer || jpegBuffer.length === 0)) {
      return { ok: false, error: '有屏幕截图为空' }
    }

    // 现有视觉接口每次只接收一张图；并行识别所有屏幕，避免串行请求让等待时间随屏幕数翻倍。
    const descriptions = await Promise.all(screenshots.map(({ jpegBuffer, index, name }) => (
      postVisionExplain(jpegBuffer, { index, total: screenshots.length, name })
    )))
    const failedIndex = descriptions.findIndex(description => !description)
    if (failedIndex >= 0) {
      return { ok: false, error: `屏幕 ${failedIndex + 1} 视觉识别无结果` }
    }

    const description = descriptions.map((text, index) => (
      `屏幕 ${index + 1}（${screenshots[index].name}）：${text}`
    )).join('\n')
    console.log(`[vision] 已识别 ${screenshots.length} 块屏幕: ${description}`)
    const previousDescription = lastVisionDescription
    persistHistory({
      category: 'vision',
      role: 'observation',
      source,
      text: description
    })
    lastVisionDescription = description
    return {
      ok: true,
      description,
      previousDescription,
      screenCount: screenshots.length,
      screenNames: screenshots.map(screenshot => screenshot.name)
    }
  } catch (e) {
    return { ok: false, error: e.message || '截屏失败' }
  }
}

// 构造 multipart/form-data 并 POST 单块屏幕到 8003 视觉接口
function postVisionExplain(jpegBuffer, screenInfo = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    let settled = false
    const logResult = (result, details = {}) => {
      if (settled) return
      settled = true
      logVisionDecision(result ? '单屏视觉识别成功' : '单屏视觉识别失败', {
        screen: Number.isFinite(screenInfo.index) ? screenInfo.index + 1 : null,
        name: screenInfo.name || null,
        durationMs: Date.now() - startedAt,
        ...details
      })
      resolve(result)
    }
    const boundary = '----ahvision' + Date.now()
    const screenLabel = Number.isFinite(screenInfo.index)
      ? `这是用户的第 ${screenInfo.index + 1}/${screenInfo.total} 块屏幕，显示器名称为“${screenInfo.name}”。`
      : ''
    const question = `${screenLabel}请仔细分析这张桌面截图，给出具体、可用于理解用户当前工作上下文的中文描述，不要只说“在写代码”“在浏览网页”之类的泛泛结论。
请覆盖以下信息：
1. 当前主要应用、窗口或网站，以及能辨认出的页面标题、项目名、文件名；
2. 屏幕中央正在查看或编辑的具体内容，包括关键文字、代码主题、报错信息、对话主题、视频或文档内容；
3. 推断用户此刻正在执行的具体任务，以及任务处于什么状态；
4. 其它有助于伙伴自然回应的细节，例如待处理问题、明显进度、成功或失败状态。
只描述截图中确实可见的内容，不确定的地方明确说“无法辨认”，不要凭空猜测。不要输出密码、API Key、Token、验证码、完整邮箱或其它敏感标识；如画面中出现，请用“[敏感信息已隐藏]”代替。输出一段约100至200字的纯文本。`
    // multipart body
    const parts = []
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="question"\r\n\r\n${question}\r\n`))
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="screen.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`))
    parts.push(jpegBuffer)
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
    const body = Buffer.concat(parts)

    const voice = getCurrentVoiceConfig()
    let url
    try {
      url = new URL('mcp/vision/explain', voice.apiUrl)
    } catch {
      logResult(null, { basis: '小智 HTTP 服务地址无效' })
      return
    }
    const transport = url.protocol === 'https:' ? require('https') : require('http')
    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
      'Client-Id': voice.clientId,
      'Device-Id': voice.deviceId
    }
    if (voice.token) headers.Authorization = `Bearer ${voice.token}`
    const req = transport.request(url, { method: 'POST', headers }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          logResult(json.success ? json.response : null, {
            httpStatus: res.statusCode,
            basis: json.success ? '服务端返回视觉描述' : (json.message || '服务端返回失败')
          })
        } catch {
          logResult(null, { httpStatus: res.statusCode, basis: '服务端响应不是有效 JSON' })
        }
      })
    })
    req.on('error', (error) => logResult(null, { basis: error.message || '网络请求失败' }))
    req.setTimeout(15000, () => {
      logResult(null, { basis: '单屏视觉请求超过 15 秒' })
      req.destroy()
    })
    req.write(body)
    req.end()
  })
}

// 一次完整的"看屏幕说话":截屏 → 描述 → 让小智基于描述生成伙伴台词
ipcMain.handle('vision-look-and-say', async () => {
  const result = await captureAndDescribe('manual-look')
  if (!result.ok) {
    voiceEmit({ type: 'vision-error', message: result.error })
    return { ok: false, error: result.error }
  }
  // 把屏幕描述作为 prompt 发给小智,让它以伙伴口吻评论
  const prompt = `你刚看到用户的屏幕:${result.description}。以桌面陪伴伙伴的口吻,用一句话自然地评论或关心一下,不要太机械。`
  const sent = await sendToXiaozhiIfConnected(prompt)
  if (sent) {
    voiceEmit({ type: 'vision-description', description: result.description })
    return { ok: true, description: result.description }
  }
  return { ok: false, error: '未连接小智' }
})

// 手动执行一次屏幕变化检查:AI 自主决定要不要说话(大部分时候安静)
// 先用服务端 LLM 做纯文本判断(不触发 TTS),决定说才走完整小智链路
ipcMain.handle('vision-check-and-maybe-say', async () => {
  // 对话进行中时不主动搭话,避免打断当前对话
  if (conversationActive) return { ok: true, decided: false, reason: 'conversation-active' }
  const result = await captureAndDescribe('manual-check')
  if (!result.ok) return { ok: false, decided: false }

  // 第一步:轻量判断 —— 服务端只返回文本，不触发小智 TTS。
  const judgePrompt = buildVisionChangePrompt(result.previousDescription, result.description)
  const judgeResult = await askXiaozhiLlm(judgePrompt)
  console.log(`[vision] 屏幕差异判断: ${judgeResult || '无结果'}`)

  // 决定安静 → 什么都不做,不触发任何声音/气泡
  if (!judgeResult || judgeResult.toUpperCase().includes('SILENT')) {
    return { ok: true, decided: false }
  }

  // 决定说话 → 让小智说 AI 判断好的那句话(走完整链路:声音 + 气泡 + 动画)
  const said = await sendToXiaozhiIfConnected(`请直接重复这句话,不加任何其它内容:${judgeResult}`)
  return { ok: said, decided: true }
})

// 轻量文本决策也由 xiaozhi-server 调用已配置的默认 LLM。
async function askXiaozhiLlm(prompt) {
  const body = Buffer.from(JSON.stringify({ prompt, max_tokens: 500 }))
  const result = await requestXiaozhiApi('/api/ai/chat', body)
  return result.success && result.text ? result.text.trim() : null
}

function buildVisionChangePrompt(previousDescription, currentDescription) {
  return `你是桌面陪伴伙伴，需要根据两次屏幕观察的语义差异决定是否主动说话。
上一次观察：${previousDescription || '这是首次观察，没有上一次记录。'}
本次观察：${currentDescription}

先在心里比较应用、页面、任务、内容和状态是否发生了有意义的变化。遵守以下规则：
1. 画面基本相同，或只有时间、光标、输入进度、轻微滚动、描述措辞不同：只回复 SILENT。
2. 用户仍在持续专注同一任务，且没有报错、完成、切换场景等明显变化：只回复 SILENT。
3. 出现新的报错、任务完成、长时间卡住、切换到休息娱乐、会议开始或结束、重要页面变化，才考虑说话。
4. 即使有变化，也只有确实能提供帮助、提醒或自然陪伴时才说；不要为了说话而说话。
5. 决定说话时，直接回复一句15字以内的自然中文；决定不说时，只回复 SILENT。`
}

// 辅助:确保小智已连接后发文本
// 仅用于内部指令(看屏幕、主动搭话等),非真实用户输入。
// 这些指令会被小智 detect 模式当成 stt 回显,故发送后登记给渲染进程过滤,避免泄漏到气泡。
async function sendToXiaozhiIfConnected(text) {
  const send = () => {
    if (voiceClient && voiceClient.isConnected) {
      voiceClient.sendText(text)
      // 通知渲染进程:这是发给 AI 的指令,回显 stt 时应跳过
      voiceEmit({ type: 'system-prompt', text })
      return true
    }
    return false
  }
  if (send()) return true
  voiceConnect()
  for (let i = 0; i < 20 && (!voiceClient || !voiceClient.isConnected); i++) {
    await new Promise((r) => setTimeout(r, 100))
  }
  return send()
}

function buildIdleProactivePrompt(description) {
  const screenContext = description
    ? `你刚看到的屏幕情况：${description}`
    : '这次没能看清用户的屏幕，不要假装知道用户正在做什么。'
  return `用户已经有一会儿没有回复你。${screenContext}
请结合最近的对话和当前画面，像熟悉的桌面伙伴一样主动发起一个自然话题。可以关心进展、追问刚才的话、针对眼前任务提出具体帮助；如果没有合适的上下文，就轻松问候。你也可以按需调用可用工具进一步了解用户正在做什么。
直接对用户说一到两句，不要提“截图”“20秒”“未回复”等机制，不要复述任何敏感信息，也不要输出分析过程。`
}

function scheduleVisionSilenceCheck(delaySeconds, reason = 'unspecified') {
  stopVisionLoop()
  const config = normalizeVisionConfig(loadConfig().vision)
  if (!config.enabled) {
    logVisionDecision('不启动未回复检测', { reason, basis: '看屏幕说话未启用' })
    return
  }
  if (config.inactivitySeconds <= 0) {
    logVisionDecision('不启动未回复检测', { reason, basis: '未回复时间为 0' })
    return
  }
  if (visionSilenceHandled) {
    logVisionDecision('不重复启动倒计时', { reason, basis: '当前主动搭话正在处理' })
    return
  }
  const secs = Math.max(1, Math.round(Number(delaySeconds) || config.inactivitySeconds))
  visionTimerDueAt = Date.now() + secs * 1000
  visionTimer = setTimeout(runVisionSilenceCheck, secs * 1000)
  logVisionDecision('已启动未回复倒计时', {
    reason,
    delaySeconds: secs,
    dueAt: new Date(visionTimerDueAt).toISOString(),
    generation: silenceGeneration
  })
}

async function runVisionSilenceCheck() {
  visionTimer = null
  visionTimerDueAt = null
  const config = normalizeVisionConfig(loadConfig().vision)
  logVisionDecision('未回复倒计时到期，开始判断', {
    enabled: config.enabled,
    inactivitySeconds: config.inactivitySeconds,
    conversationActive,
    visionCheckInFlight,
    visionSilenceHandled,
    generation: silenceGeneration
  })
  if (!config.enabled || config.inactivitySeconds <= 0 || visionSilenceHandled) {
    logVisionDecision('本次不主动搭话', {
      basis: !config.enabled
        ? '看屏幕说话未启用'
        : config.inactivitySeconds <= 0
          ? '未回复时间为 0'
          : '当前主动搭话已在处理'
    })
    return
  }

  // 不打断正在进行的回答；等本轮回答结束后会重新开始完整倒计时。
  if (conversationActive || visionCheckInFlight) {
    logVisionDecision('延后主动搭话', {
      basis: conversationActive ? '伙伴正在思考或说话' : '上一次屏幕分析尚未完成',
      retrySeconds: 1
    })
    scheduleVisionSilenceCheck(1, 'busy-retry')
    return
  }

  const generation = silenceGeneration
  visionSilenceHandled = true
  visionCheckInFlight = true
  try {
    logVisionDecision('决定主动看屏幕', {
      basis: `用户连续 ${config.inactivitySeconds} 秒未发消息，且当前无对话、无截图任务`,
      generation
    })
    const result = await captureAndDescribe('inactivity-check')

    // 截图期间用户可能已经回复；这时放弃本次主动搭话，尊重新消息。
    if (generation !== silenceGeneration || conversationActive) {
      logVisionDecision('取消本次主动搭话', {
        basis: generation !== silenceGeneration ? '截图期间收到了新用户消息' : '截图期间开始了新对话',
        startGeneration: generation,
        currentGeneration: silenceGeneration
      })
      return
    }

    logVisionDecision('生成主动搭话依据', result.ok
      ? {
          visionSucceeded: true,
          screenCount: result.screenCount,
          screenNames: result.screenNames,
          descriptionChars: result.description.length
        }
      : {
          visionSucceeded: false,
          basis: result.error || '屏幕识别失败，改用通用问候'
        })
    const prompt = buildIdleProactivePrompt(result.ok ? result.description : '')
    const sent = await sendToXiaozhiIfConnected(prompt)
    logVisionDecision(sent ? '主动搭话指令已发送' : '主动搭话发送失败', {
      connected: Boolean(voiceClient && voiceClient.isConnected),
      usedVisionContext: result.ok,
      generation
    })
    if (sent && result.ok) {
      voiceEmit({ type: 'vision-description', description: result.description })
    } else if (!sent && generation === silenceGeneration) {
      // 暂时连接失败时允许稍后再试，而不是永久吃掉这一轮。
      visionSilenceHandled = false
      scheduleVisionSilenceCheck(config.inactivitySeconds, 'send-failed-retry')
    }
  } finally {
    visionCheckInFlight = false
  }
}

// 兼容现有 IPC 名称；机制已从固定间隔轮询改为一次性的“未回复”倒计时。
function startVisionLoop(inactivitySeconds) {
  visionSilenceHandled = false
  scheduleVisionSilenceCheck(inactivitySeconds, 'vision-start')
  return { ok: true }
}

ipcMain.handle('vision-start-loop', async (_, inactivitySeconds) => startVisionLoop(inactivitySeconds))

ipcMain.handle('vision-stop-loop', async () => {
  stopVisionLoop()
  return { ok: true }
})

function stopVisionLoop() {
  if (visionTimer) { clearTimeout(visionTimer); visionTimer = null }
  visionTimerDueAt = null
}

app.whenReady().then(() => {
  console.log(`[history] 对话与屏幕观察记录: ${HISTORY_PATH}`)
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

  // 启动“用户未回复”检测(若已启用)。
  const initConfig = loadConfig()
  const visionCfg = normalizeVisionConfig(initConfig.vision)
  if (visionCfg.enabled && visionCfg.inactivitySeconds > 0) {
    startVisionLoop(visionCfg.inactivitySeconds)
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
