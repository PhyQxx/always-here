import { mergeWagemanConfig } from '../widgets/wagemanDefaults.mjs'
import { normalizePetChatSettings } from '../widgets/petChatter.mjs'
import { normalizeVoiceSettings } from '../widgets/voiceSettings.mjs'
import { normalizeVisionSettings } from '../widgets/voiceSettings.mjs'
import { normalizeReminders } from '../widgets/petReminders.mjs'
import { PET_EVENTS } from './events.mjs'

let config = null

const DEFAULT_WIDGETS = {
  clock: { enabled: true, x: 50, y: 50 },
  pet: { enabled: true, x: 300, y: 400 },
  timer: { enabled: true, x: 50, y: 200, mode: 'pomodoro', workTime: 25, breakTime: 5 },
  note: { enabled: true, x: 600, y: 50 },
  wageman: { enabled: true, x: 600, y: 350 }
}

const CURRENT_CONFIG_VERSION = 1

export async function initConfig() {
  config = await window.alwaysHere.getConfig()

  migrateConfig(config)

  for (const key in DEFAULT_WIDGETS) {
    config.widgets[key] = { ...DEFAULT_WIDGETS[key], ...(config.widgets[key] || {}) }
  }
  if (!config.theme) config.theme = 'dark'
  if (!config.petId) config.petId = 'hina'
  if (!config.petFolderPath) config.petFolderPath = ''
  // 提醒默认值统一来自 petReminders.mjs 的 normalizeReminders(单一数据源)
  config.reminders = normalizeReminders(config.reminders)
  config.petChat = normalizePetChatSettings(config.petChat)
  config.voice = normalizeVoiceSettings(config.voice)
  config.vision = normalizeVisionSettings(config.vision)
  config.wageman = mergeWagemanConfig(config.wageman)
  if (config.happiness === undefined) config.happiness = 70
  if (!config.noteText) config.noteText = ''
  if (!Array.isArray(config.activityLog)) config.activityLog = []

  if (config.configVersion !== CURRENT_CONFIG_VERSION) {
    config.configVersion = CURRENT_CONFIG_VERSION
    await saveConfig()
  }

  return config
}

// 配置版本迁移:按 from→to 版本阶梯执行。
// 当前无实际迁移项;新增字段时走 normalizeXxx 即可,无需改版本号。
// 仅当字段重命名/结构重组时才在此追加 [from, to, fn] 条目并提升 CURRENT_CONFIG_VERSION。
const MIGRATIONS = [
  // 示例(未来 v1→v2):
  // [1, 2, (cfg) => { cfg.xxx = cfg.legacyField; delete cfg.legacyField }]
]

function migrateConfig(cfg) {
  if (typeof cfg.configVersion !== 'number') cfg.configVersion = 0
  for (const [from, to, fn] of MIGRATIONS) {
    if (cfg.configVersion >= to) continue
    if (cfg.configVersion === from) {
      fn(cfg)
      cfg.configVersion = to
    }
  }
}

export function getConfig() {
  return config
}

export async function saveConfig() {
  await window.alwaysHere.saveConfig(config)
}

export function applyWidgetPositions() {
  for (const key in config.widgets) {
    const el = document.getElementById('widget-' + key)
    if (!el) continue
    const w = config.widgets[key]
    el.classList.toggle('hidden', !w.enabled)
    el.style.left = w.x + 'px'
    el.style.top = w.y + 'px'
    const check = document.getElementById('setting-' + key)
    if (check) check.checked = w.enabled
  }
  // 显隐变更后通知 drag.js 清空穿透命中检测缓存
  window.dispatchEvent(new CustomEvent(PET_EVENTS.WIDGETS_VISIBILITY_CHANGED))
}

export function applyTheme() {
  document.body.className = config.theme ? 'theme-' + config.theme : ''
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === (config.theme || 'dark'))
  })
}

export function applyAll() {
  applyWidgetPositions()
  applyTheme()
  document.getElementById('setting-onTop').checked = config.alwaysOnTop
}
