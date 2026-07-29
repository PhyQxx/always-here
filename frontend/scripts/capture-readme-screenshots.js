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
    width: 1440,
    height: 1024,
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
    document.body.style.background = document.body.classList.contains('theme-cozy') ? '#e9e1dc' : '#111426';
    document.body.style.width = '1440px';
    document.body.style.height = '1024px';
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
  await screenshot(win, 'overview-cozy.png')

  await win.webContents.executeJavaScript(`
    document.querySelector('[data-theme="ambient"]')?.click();
    document.body.style.background = '#111426';
  `)
  await screenshot(win, 'overview-ambient.png')

  await win.webContents.executeJavaScript(`
    document.querySelector('[data-theme="neo"]')?.click();
    document.body.style.background = '#17131d';
  `)
  await screenshot(win, 'overview-neo.png')

  await win.webContents.executeJavaScript(`
    document.querySelector('[data-theme="cozy"]')?.click();
    document.body.style.background = '#e9e1dc';
  `)

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
    document.querySelector('.settings-tab[data-tab="system"]')?.click();
  `)
  await screenshot(win, 'global-settings.png')

  win.destroy()
  app.quit()
}

main().catch(error => {
  console.error(error)
  app.exit(1)
})
