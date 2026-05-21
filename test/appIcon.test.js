const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const packageJson = require('../package.json')

function readPngSize(filePath) {
  const data = fs.readFileSync(filePath)
  assert.equal(data.toString('ascii', 1, 4), 'PNG')
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20)
  }
}

test('app icon assets are configured for runtime and Windows builds', () => {
  const {
    APP_ICON_ICO_PATH,
    APP_ICON_PNG_PATH,
    TRAY_ICON_PNG_PATH,
    getNotificationOptions
  } = require('../src/appIcon')

  assert.equal(APP_ICON_PNG_PATH, path.resolve(__dirname, '../src/assets/app-icon.png'))
  assert.equal(TRAY_ICON_PNG_PATH, path.resolve(__dirname, '../src/assets/tray-icon.png'))
  assert.equal(APP_ICON_ICO_PATH, path.resolve(__dirname, '../build/icon.ico'))
  assert.equal(packageJson.build.win.icon, 'build/icon.ico')
  assert.equal(fs.existsSync(APP_ICON_PNG_PATH), true)
  assert.equal(fs.existsSync(TRAY_ICON_PNG_PATH), true)
  assert.equal(fs.existsSync(APP_ICON_ICO_PATH), true)
  assert.notEqual(TRAY_ICON_PNG_PATH, APP_ICON_PNG_PATH)
  assert.deepEqual(readPngSize(TRAY_ICON_PNG_PATH), { width: 256, height: 256 })

  assert.deepEqual(getNotificationOptions({ title: 'Break time', body: 'Stand up' }), {
    title: 'Break time',
    body: 'Stand up',
    icon: APP_ICON_PNG_PATH
  })
  assert.deepEqual(getNotificationOptions({}), {
    title: 'Always Here',
    body: '',
    icon: APP_ICON_PNG_PATH
  })
})
