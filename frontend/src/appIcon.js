const path = require('path')

const APP_ICON_PNG_PATH = path.join(__dirname, 'assets', 'app-icon.png')
const TRAY_ICON_PNG_PATH = path.join(__dirname, 'assets', 'tray-icon.png')
const APP_ICON_ICO_PATH = path.resolve(__dirname, '..', 'build', 'icon.ico')

function getNotificationOptions(payload) {
  return {
    title: typeof payload?.title === 'string' ? payload.title : 'Always Here',
    body: typeof payload?.body === 'string' ? payload.body : '',
    icon: APP_ICON_PNG_PATH
  }
}

module.exports = {
  APP_ICON_ICO_PATH,
  APP_ICON_PNG_PATH,
  TRAY_ICON_PNG_PATH,
  getNotificationOptions
}
