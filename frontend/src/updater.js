const { autoUpdater } = require('electron-updater')
const { dialog, Notification, app } = require('electron')
const { getNotificationOptions } = require('./appIcon')

// --- 配置区 ---
const UPDATE_URL = 'https://ftp.pnkx.top:8/ftp/always-here/'
// --------------

autoUpdater.logger = require('electron-log')
autoUpdater.logger.transports.file.level = 'info'

function initUpdater(mainWindow) {
  autoUpdater.autoDownload = true
  autoUpdater.setFeedURL(UPDATE_URL)

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err)
  })

  autoUpdater.on('update-available', (info) => {
    if (Notification.isSupported()) {
      new Notification(getNotificationOptions({
        title: '发现新版本',
        body: `新版本 v${info.version} 已开始后台下载...`
      })).show()
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新就绪',
      message: `新版本 v${info.version} 已下载完成，重启以应用更新。`,
      buttons: ['现在重启', '以后再说'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall()
      }
    })
  })

  // 立即检查更新
  autoUpdater.checkForUpdatesAndNotify()
}

async function checkHotUpdate(mainWindow) {
  try {
    const result = await autoUpdater.checkForUpdates()
    const currentVersion = app.getVersion()
    
    if (result && result.updateInfo.version === currentVersion) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '已经是最新版本',
        message: `当前版本 v${currentVersion} 已经是最新版。`,
        buttons: ['确定']
      })
    }
    return result
  } catch (err) {
    console.error('Manual check failed:', err)
    throw err
  }
}

module.exports = { initUpdater, checkHotUpdate }
