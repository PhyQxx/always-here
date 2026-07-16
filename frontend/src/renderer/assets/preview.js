const { app, BrowserWindow } = require('electron')
const path = require('path')
app.whenReady().then(() => {
  const win = new BrowserWindow({ show: true, width: 1200, height: 900, webPreferences: { nodeIntegration: true, contextIsolation: false } })
  win.loadFile(path.join(__dirname, 'preview.html'))
  win.setTitle('Sprite Preview - 9 rows x 8 cols')
})
