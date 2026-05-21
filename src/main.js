const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, dialog, Notification } = require('electron')
const path = require('path')
const fs = require('fs')
const { APP_ICON_PNG_PATH, TRAY_ICON_PNG_PATH, getNotificationOptions } = require('./appIcon')
const { CODEX_PETS_DIR, getPetSpritesheetDataUrl, listPets } = require('./petStore')

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')

const DEFAULT_CONFIG = {
  widgets: {
    clock: { enabled: true, x: 50, y: 50 },
    pet: { enabled: true, x: 300, y: 400 },
    timer: { enabled: true, x: 50, y: 200 },
    note: { enabled: true, x: 600, y: 50 },
    wageman: { enabled: true, x: 600, y: 350 }
  },
  alwaysOnTop: true,
  opacity: 1.0,
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
  happiness: 70,
  noteText: '',
  wageman: {
    clockIn: '09:00',
    clockOut: '17:00',
    monthlySalary: '8000',
    workDays: '',
    workDaysAuto: true,
    offWorkStops: {}
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }
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
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Always Here', enabled: false },
    { type: 'separator' },
    { label: '设置', click: () => { if (mainWindow) mainWindow.webContents.send('show-settings') } },
    { label: '显示/隐藏', click: () => toggleVisibility() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ])
  tray.setToolTip('Always Here')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => toggleVisibility())
}

function toggleVisibility() {
  if (!mainWindow) return
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
  }
}

// IPC handlers
ipcMain.handle('get-config', () => loadConfig())
ipcMain.handle('save-config', (_, config) => {
  saveConfig(config)
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(config.alwaysOnTop)
  }
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
ipcMain.handle('show-notification', (_, payload) => {
  if (!Notification.isSupported()) return false
  new Notification(getNotificationOptions(payload)).show()
  return true
})
ipcMain.handle('fetch-holidays', async (_, year) => {
  const https = require('https')
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

ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('check-hot-update', async () => {
  if (!app.isPackaged) return { error: '开发环境不支持热更新' }
  try {
    const { checkHotUpdate } = require('./updater')
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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (!mainWindow) createWindow()
})
