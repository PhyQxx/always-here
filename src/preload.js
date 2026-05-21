const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('alwaysHere', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  setClickThrough: (ignore) => ipcRenderer.invoke('set-click-through', ignore),
  getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
  setAutoStart: (enable) => ipcRenderer.invoke('set-auto-start', enable),
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  listPets: () => ipcRenderer.invoke('list-pets'),
  getPetSpritesheet: (petId) => ipcRenderer.invoke('get-pet-spritesheet', petId),
  choosePetFolder: () => ipcRenderer.invoke('choose-pet-folder'),
  importPetPackage: () => ipcRenderer.invoke('import-pet-package'),
  openExternal: (url) => ipcRenderer.invoke('open-external-url', url),
  exportActivityLog: (csvText) => ipcRenderer.invoke('export-activity-log', csvText),
  showNotification: (payload) => ipcRenderer.invoke('show-notification', payload),
  onShowSettings: (callback) => ipcRenderer.on('show-settings', callback),
  onTrayCommand: (callback) => ipcRenderer.on('tray-command', (_event, command) => callback(command)),
  fetchHolidays: (year) => ipcRenderer.invoke('fetch-holidays', year),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkHotUpdate: () => ipcRenderer.invoke('check-hot-update')
})
