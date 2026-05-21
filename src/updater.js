const { app, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const https = require('https')

// 这里替换为你实际的接口地址
const UPDATE_CHECK_URL = 'https://your-server.com/api/check-update' 

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } 
        catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${res.statusCode})`))
        return
      }
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
    }).on('error', (err) => {
      fs.unlink(dest, () => {}) // Delete the file async.
      reject(err)
    })
  })
}

async function checkHotUpdate(mainWindow) {
  const currentVersion = app.getVersion()
  
  try {
    // 1. 请求更新接口
    const data = await fetchJson(UPDATE_CHECK_URL)
    
    // 我们约定接口返回格式为:
    // { "version": "1.1.0", "asar": "https://...", "description": "更新内容..." }
    if (!data || !data.version || !data.asar) {
      throw new Error('接口返回格式不正确')
    }

    if (data.version !== currentVersion) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '发现新版本',
        message: `发现新版本 v${data.version}\n\n当前版本: v${currentVersion}\n\n更新内容:\n${data.description || '修复了一些bug'}`,
        buttons: ['立即更新并重启', '以后再说']
      })

      if (response === 0) {
        await doHotUpdate(data.asar)
      }
    } else {
      // 只有手动点击检查更新时才会弹这个
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '已经是最新版本',
        message: `当前版本 v${currentVersion} 已经是最新版。`,
        buttons: ['确定']
      })
    }
  } catch (err) {
    console.error('Check update failed:', err)
    throw new Error('网络请求失败或接口不可用')
  }
}

async function doHotUpdate(asarUrl) {
  const resourcesPath = process.resourcesPath
  const tempAsarPath = path.join(app.getPath('temp'), 'update_always_here.asar')
  const targetAsarPath = path.join(resourcesPath, 'app.asar')

  // 下载新的 ASAR 到临时目录
  await downloadFile(asarUrl, tempAsarPath)

  // 准备 Windows 替换脚本
  const batPath = path.join(app.getPath('temp'), 'update_always_here.bat')
  const exePath = app.getPath('exe')
  
  // 脚本逻辑：
  // 1. 杀掉当前进程
  // 2. 等待进程彻底退出
  // 3. 覆盖 app.asar
  // 4. 重启 exe
  // 5. 删除临时脚本自己
  const batContent = `
@echo off
chcp 65001
setlocal
taskkill /f /im "${path.basename(exePath)}" >nul 2>&1
:wait
timeout /t 1 /nobreak >nul
tasklist | find /i "${path.basename(exePath)}" >nul
if errorlevel 1 (
  move /y "${tempAsarPath}" "${targetAsarPath}"
  start "" "${exePath}"
  del "%~f0"
) else (
  goto wait
)
  `

  fs.writeFileSync(batPath, batContent)

  // 运行脚本并退出当前进程
  spawn('cmd.exe', ['/c', batPath], { detached: true, stdio: 'ignore' }).unref()
  app.quit()
}

module.exports = { checkHotUpdate }