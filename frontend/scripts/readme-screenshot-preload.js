const { contextBridge } = require('electron')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const packageJson = require(path.join(root, 'package.json'))
const spritesheetPath = path.join(root, 'src', 'renderer', 'assets', 'pets', 'hina', 'spritesheet.webp')

const config = {
  widgets: {
    clock: { enabled: true, x: 72, y: 58 },
    pet: { enabled: true, x: 420, y: 275 },
    timer: { enabled: true, x: 72, y: 210 },
    note: { enabled: true, x: 805, y: 78 },
    wageman: { enabled: true, x: 760, y: 455 }
  },
  alwaysOnTop: true,
  theme: 'dark',
  petId: 'hina',
  petFolderPath: path.join(root, 'src', 'renderer', 'assets', 'pets'),
  reminders: {
    hourly: { enabled: true, systemNotification: false },
    water: { enabled: true, intervalMinutes: 30, systemNotification: false },
    sedentary: { enabled: true, intervalMinutes: 60, systemNotification: false },
    work: { enabled: true, systemNotification: false }
  },
  happiness: 82,
  noteText: '今天先完成一个小目标。\n\n记得喝水、保存进度，也给自己留一点喘气的空间。',
  activityLog: [],
  wageman: {
    clockIn: '09:00',
    clockOut: '18:00',
    monthlySalary: '12000',
    workDays: '22',
    workDaysAuto: false,
    offWorkStops: {}
  }
}

function petSpritesheetDataUrl() {
  const data = fs.readFileSync(spritesheetPath).toString('base64')
  return {
    id: 'hina',
    mimeType: 'image/webp',
    dataUrl: `data:image/webp;base64,${data}`
  }
}

contextBridge.exposeInMainWorld('alwaysHere', {
  getConfig: async () => config,
  saveConfig: async (nextConfig) => Object.assign(config, nextConfig),
  setClickThrough: async () => false,
  getScreenSize: async () => ({ width: 1280, height: 900 }),
  setAutoStart: async () => false,
  getAutoStart: async () => false,
  listPets: async () => [{
    id: 'hina',
    folderName: 'hina',
    displayName: 'Hina',
    description: 'Built-in desktop companion'
  }],
  getPetSpritesheet: async () => petSpritesheetDataUrl(),
  choosePetFolder: async () => null,
  showNotification: async () => false,
  onShowSettings: (callback) => window.addEventListener('readme-show-settings', callback),
  fetchHolidays: async () => null,
  getAppVersion: async () => packageJson.version,
  checkHotUpdate: async () => ({ success: true })
})
