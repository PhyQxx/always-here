const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, dialog, Notification, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { APP_ICON_PNG_PATH, TRAY_ICON_PNG_PATH, getNotificationOptions } = require('./appIcon')
const https = require('https')
const { CODEX_PETS_DIR, getPetSpritesheetDataUrl, importCodexPetPackage, isInside, listPets } = require('./petStore')
const { initUpdater, checkHotUpdate } = require('./updater')

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

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.always-here.app')
  }
  createWindow()
  createTray()
  
  // 初始化更新检查
  if (app.isPackaged) {
    initUpdater(mainWindow)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (!mainWindow) createWindow()
})
