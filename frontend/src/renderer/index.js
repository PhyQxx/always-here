import { initConfig, getConfig, saveConfig, applyAll } from './utils/config.js'
import { initClickThrough, makeDraggable } from './utils/drag.js'
import { initClock } from './widgets/clock.js'
import { initPet } from './widgets/pet.js'
import { initPetVoice } from './widgets/petVoice.mjs'
import { initTimer } from './widgets/timer.js'
import { initNote } from './widgets/note.js'
import { initWageman } from './widgets/wageman.js'
import { initSettings } from './settings.js'

// 桌面挂件键名,settings.js 等模块也按此顺序处理。
// 单一来源:避免散落各处的硬编码数组漂移。
export const WIDGET_KEYS = ['clock', 'pet', 'timer', 'note', 'wageman']

// 包裹单个 widget 初始化:任一抛错只影响自身,不阻断其余挂件。
// pet 是 async,统一 await 确保异常能被捕获。
async function safeInit(name, fn) {
  try {
    await fn()
  } catch (e) {
    console.error(`[init] ${name} 初始化失败:`, e)
  }
}

async function init() {
  await initConfig()
  const config = getConfig()

  applyAll()
  initClickThrough()

  await safeInit('clock', () => initClock())
  await safeInit('pet', () => initPet(getConfig, saveConfig))
  await safeInit('petVoice', () => initPetVoice(getConfig, saveConfig))
  await safeInit('timer', () => initTimer(getConfig, saveConfig))
  await safeInit('note', () => initNote(getConfig, saveConfig))
  await safeInit('wageman', () => initWageman(getConfig, saveConfig))

  WIDGET_KEYS.forEach(key => {
    const el = document.getElementById('widget-' + key)
    if (el) makeDraggable(el, key, config, saveConfig)
  })

  await safeInit('settings', () => initSettings(getConfig, saveConfig))
}

init()
