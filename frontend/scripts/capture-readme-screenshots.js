const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const outputDir = path.join(root, 'docs', 'images')

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function prepareWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, 'readme-screenshot-preload.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })

  win.webContents.on('console-message', (_event, level, message) => {
    console.log(`[renderer:${level}] ${message}`)
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details)
  })

  await win.loadFile(path.join(root, 'src', 'renderer', 'index.html'))
  await wait(1400)
  await win.webContents.executeJavaScript(`
    document.body.style.background =
      'radial-gradient(circle at 20% 20%, rgba(124,111,247,.28), transparent 28%),' +
      'linear-gradient(135deg, #101827 0%, #172033 48%, #243044 100%)';
    document.body.style.width = '1280px';
    document.body.style.height = '900px';
  `)
  return win
}

async function screenshot(win, name) {
  await wait(350)
  const image = await win.capturePage()
  fs.writeFileSync(path.join(outputDir, name), image.toPNG())
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  await app.whenReady()

  const win = await prepareWindow()
  await screenshot(win, 'overview.png')

  await win.webContents.executeJavaScript(`
    document.getElementById('settings-panel')?.classList.add('hidden');
    document.getElementById('widget-pet')?.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 490,
      clientY: 320
    }));
  `)
  await screenshot(win, 'pet-settings.png')

  await win.webContents.executeJavaScript(`
    document.getElementById('settings-panel')?.classList.add('hidden');
    window.dispatchEvent(new Event('readme-show-settings'));
  `)
  await screenshot(win, 'global-settings.png')

  win.destroy()
  app.quit()
}

main().catch(error => {
  console.error(error)
  app.exit(1)
})
