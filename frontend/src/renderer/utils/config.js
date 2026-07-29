import { mergeWagemanConfig } from '../widgets/wagemanDefaults.mjs'
import { normalizePetChatSettings } from '../widgets/petChatter.mjs'
import { normalizeVoiceSettings } from '../widgets/voiceSettings.mjs'
import { normalizeVisionSettings } from '../widgets/voiceSettings.mjs'
import { normalizeReminders } from '../widgets/petReminders.mjs'
import { PET_EVENTS } from './events.mjs'

let config = null

const DEFAULT_WIDGETS = {
  clock: { enabled: true, x: 72, y: 58 },
  pet: { enabled: true, x: 560, y: 410 },
  timer: { enabled: true, x: 72, y: 560, mode: 'pomodoro', workTime: 25, breakTime: 5 },
  note: { enabled: true, x: 920, y: 78 },
  wageman: { enabled: true, x: 900, y: 550 }
}

const CURRENT_CONFIG_VERSION = 1

export async function initConfig() {
  config = await window.alwaysHere.getConfig()

  migrateConfig(config)

  for (const key in DEFAULT_WIDGETS) {
    config.widgets[key] = { ...DEFAULT_WIDGETS[key], ...(config.widgets[key] || {}) }
  }
  const legacyThemes = {
    dark: 'ambient',
    ocean: 'ambient',
    forest: 'cozy',
    sakura: 'cozy'
  }
  config.theme = legacyThemes[config.theme] || config.theme || 'cozy'
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
  if (!config.themeLayouts || typeof config.themeLayouts !== 'object') config.themeLayouts = {}

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
    const maxX = Math.max(16, window.innerWidth - Math.max(el.offsetWidth, 120) - 16)
    const maxY = Math.max(16, window.innerHeight - Math.max(el.offsetHeight, 100) - 16)
    w.x = Math.max(16, Math.min(Number(w.x) || 16, maxX))
    w.y = Math.max(16, Math.min(Number(w.y) || 16, maxY))
    el.style.left = w.x + 'px'
    el.style.top = w.y + 'px'
    const check = document.getElementById('setting-' + key)
    if (check) check.checked = w.enabled
  }
  // 显隐变更后通知 drag.js 清空穿透命中检测缓存
  window.dispatchEvent(new CustomEvent(PET_EVENTS.WIDGETS_VISIBILITY_CHANGED))
}

export function applyTheme() {
  const theme = ['ambient', 'cozy', 'neo'].includes(config.theme) ? config.theme : 'cozy'
  config.theme = theme
  document.body.className = 'theme-' + theme
  document.documentElement.dataset.theme = theme
  document.querySelectorAll('.theme-btn').forEach(btn => {
    const active = btn.dataset.theme === theme
    btn.classList.toggle('active', active)
    btn.setAttribute('aria-pressed', String(active))
  })
}

export function applyAll() {
  applyWidgetPositions()
  applyTheme()
  document.getElementById('setting-onTop').checked = config.alwaysOnTop
}
