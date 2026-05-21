import { mergeWagemanConfig } from '../widgets/wagemanDefaults.mjs'
import { normalizePetChatSettings } from '../widgets/petChatter.mjs'

let config = null

const DEFAULT_WIDGETS = {
  clock: { enabled: true, x: 50, y: 50 },
  pet: { enabled: true, x: 300, y: 400 },
  timer: { enabled: true, x: 50, y: 200 },
  note: { enabled: true, x: 600, y: 50 },
  wageman: { enabled: true, x: 600, y: 350 }
}

const DEFAULT_REMINDERS = {
  hourly: { enabled: true, systemNotification: false },
  water: { enabled: true, intervalMinutes: 30, systemNotification: false },
  sedentary: { enabled: true, intervalMinutes: 60, systemNotification: false },
  work: { enabled: true, systemNotification: false }
}

export async function initConfig() {
  config = await window.alwaysHere.getConfig()
  for (const key in DEFAULT_WIDGETS) {
    if (!config.widgets[key]) config.widgets[key] = { ...DEFAULT_WIDGETS[key] }
  }
  if (!config.theme) config.theme = 'dark'
  if (!config.petId) config.petId = 'hina'
  if (!config.petFolderPath) config.petFolderPath = 'C:\\Users\\61759\\.codex\\pets'
  config.reminders = mergeReminders(config.reminders)
  config.petChat = normalizePetChatSettings(config.petChat)
  config.wageman = mergeWagemanConfig(config.wageman)
  if (config.happiness === undefined) config.happiness = 70
  if (!config.noteText) config.noteText = ''
  if (!Array.isArray(config.activityLog)) config.activityLog = []
  return config
}

function mergeReminders(reminders = {}) {
  const merged = {}
  for (const key in DEFAULT_REMINDERS) {
    merged[key] = { ...DEFAULT_REMINDERS[key], ...(reminders[key] || {}) }
    if ((key === 'water' || key === 'sedentary') && merged[key].intervalMinutes === undefined) {
      merged[key].intervalMinutes = DEFAULT_REMINDERS[key].intervalMinutes
    }
    delete merged[key].intervalSeconds
  }
  return merged
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
