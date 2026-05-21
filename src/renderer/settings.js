import {
  buildActivityAnalysis,
  formatActivityEntry,
  formatDuration,
  summarizeActivityLog
} from './utils/activityStats.mjs'
import {
  getSettingsTitle,
  isSettingsRowVisible
} from './settingsScopes.mjs'
import { normalizePetChatSettings } from './widgets/petChatter.mjs'

export function initSettings(getConfig, saveConfig) {
  const panel = document.getElementById('settings-panel')
  const title = document.getElementById('settings-title')
  const closeBtn = document.getElementById('settings-close')
  const petSelect = document.getElementById('setting-pet-select')
  const versionSpan = document.getElementById('app-version')
  const updateBtn = document.getElementById('check-update-btn')

  // Load version
  window.alwaysHere.getAppVersion().then(version => {
    versionSpan.textContent = `版本: v${version}`
  })

  updateBtn.addEventListener('click', async () => {
    const originalText = updateBtn.textContent
    updateBtn.textContent = '检查中...'
    updateBtn.disabled = true
    try {
      const res = await window.alwaysHere.checkHotUpdate()
      if (res && res.error) {
        alert(res.error)
      }
    } catch (e) {
      alert('更新检查失败: ' + e.message)
    } finally {
      updateBtn.textContent = originalText
      updateBtn.disabled = false
    }
  })

  function showPanel(mode = { type: 'global' }) {
    if (title) title.textContent = getSettingsTitle(mode)
    panel.querySelectorAll('.setting-row').forEach(row => {
      const scope = row.dataset.settingsScope || ''
      row.classList.toggle('hidden', !isSettingsRowVisible(scope, mode))
    })
    panel.classList.remove('hidden')
    window.alwaysHere.setClickThrough(false)
  }

  document.querySelectorAll('.widget').forEach(w => {
    w.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      showPanel({
        type: 'widget',
        widgetKey: w.dataset.widget
      })
    })
  })

  window.alwaysHere.onShowSettings(() => showPanel({ type: 'global' }))

  closeBtn.addEventListener('click', () => panel.classList.add('hidden'))

  const widgetKeys = ['clock', 'pet', 'timer', 'note', 'wageman']
  widgetKeys.forEach(key => {
    const check = document.getElementById('setting-' + key)
    if (!check) return
    check.addEventListener('change', () => {
      getConfig().widgets[key].enabled = check.checked
      applyWidgetPositions(getConfig())
      saveConfig()
    })
  })

  document.getElementById('setting-onTop').addEventListener('change', (e) => {
    getConfig().alwaysOnTop = e.target.checked
    saveConfig()
  })

  const autoStartCheck = document.getElementById('setting-autoStart')
  window.alwaysHere.getAutoStart().then(enabled => { autoStartCheck.checked = enabled })
  autoStartCheck.addEventListener('change', async (e) => {
    await window.alwaysHere.setAutoStart(e.target.checked)
  })

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      getConfig().theme = btn.dataset.theme
      applyTheme(getConfig())
      saveConfig()
    })
  })

  initPetSelect(petSelect, getConfig, saveConfig)
  initPetFolder(getConfig, saveConfig)
  initReminderSettings(getConfig, saveConfig)
  initPetChatSettings(getConfig, saveConfig)
  initActivityPanel(getConfig)
}

async function refreshPetSelect(select, getConfig, saveConfig) {
  const pets = await window.alwaysHere.listPets()
  select.replaceChildren()

  if (!pets.length) {
    const option = document.createElement('option')
    option.value = ''
    option.textContent = '未找到本地宠物'
    select.appendChild(option)
    select.disabled = true
    return
  }

  select.disabled = false
  pets.forEach(pet => {
    const option = document.createElement('option')
    option.value = pet.id
    option.textContent = pet.displayName || pet.id
    option.title = pet.description || ''
    select.appendChild(option)
  })

  const config = getConfig()
  if (!pets.some(pet => pet.id === config.petId)) {
    config.petId = pets[0].id
    await saveConfig()
  }
  select.value = config.petId
}

async function initPetSelect(select, getConfig, saveConfig) {
  if (!select) return

  try {
    await refreshPetSelect(select, getConfig, saveConfig)
    select.addEventListener('change', async () => {
      getConfig().petId = select.value
      await saveConfig()
      window.dispatchEvent(new CustomEvent('pet-selection-changed'))
    })
  } catch (error) {
    console.warn('Failed to list pets:', error)
    select.disabled = true
  }
}

function initPetFolder(getConfig, saveConfig) {
  const valueEl = document.getElementById('setting-pet-folder')
  const chooseBtn = document.getElementById('setting-pet-folder-choose')
  const petSelect = document.getElementById('setting-pet-select')
  if (!valueEl || !chooseBtn) return

  function render() {
    valueEl.textContent = getConfig().petFolderPath || ''
    valueEl.title = getConfig().petFolderPath || ''
  }

  render()
  chooseBtn.addEventListener('click', async () => {
    const folder = await window.alwaysHere.choosePetFolder()
    if (!folder) return
    getConfig().petFolderPath = folder
    await saveConfig()
    render()
    if (petSelect) await refreshPetSelect(petSelect, getConfig, saveConfig)
    window.dispatchEvent(new CustomEvent('pet-selection-changed'))
  })
}

function initReminderSettings(getConfig, saveConfig) {
  const bindings = [
    ['hourly', 'enabled', 'reminder-hourly-enabled', 'checked'],
    ['hourly', 'systemNotification', 'reminder-hourly-notify', 'checked'],
    ['water', 'enabled', 'reminder-water-enabled', 'checked'],
    ['water', 'systemNotification', 'reminder-water-notify', 'checked'],
    ['water', 'intervalMinutes', 'reminder-water-interval', 'value'],
    ['sedentary', 'enabled', 'reminder-sedentary-enabled', 'checked'],
    ['sedentary', 'systemNotification', 'reminder-sedentary-notify', 'checked'],
    ['sedentary', 'intervalMinutes', 'reminder-sedentary-interval', 'value'],
    ['work', 'enabled', 'reminder-work-enabled', 'checked'],
    ['work', 'systemNotification', 'reminder-work-notify', 'checked']
  ]

  const reminders = ensureReminderConfig(getConfig())
  bindings.forEach(([type, prop, id, field]) => {
    const el = document.getElementById(id)
    if (!el) return
    el[field] = reminders[type][prop]
    el.addEventListener('change', async () => {
      const nextValue = field === 'checked'
        ? el.checked
        : Math.max(1, Number(el.value) || 1)
      reminders[type][prop] = nextValue
      if (field === 'value') el.value = nextValue
      await saveConfig()
      window.dispatchEvent(new CustomEvent('reminder-settings-changed', {
        detail: { type, prop }
      }))
    })
  })
}

function initPetChatSettings(getConfig, saveConfig) {
  const enabledEl = document.getElementById('pet-chat-enabled')
  const intervalEl = document.getElementById('pet-chat-interval')
  const quietEl = document.getElementById('pet-chat-quiet')
  if (!enabledEl || !intervalEl || !quietEl) return

  const config = getConfig()
  config.petChat = normalizePetChatSettings(config.petChat)

  function render() {
    const settings = normalizePetChatSettings(config.petChat)
    enabledEl.checked = settings.enabled
    intervalEl.value = settings.intervalMinutes
    intervalEl.disabled = !settings.enabled || settings.quietMode
    quietEl.checked = settings.quietMode
  }

  async function persist(nextSettings) {
    config.petChat = normalizePetChatSettings(nextSettings)
    render()
    await saveConfig()
    window.dispatchEvent(new CustomEvent('pet-chat-settings-changed'))
  }

  render()
  enabledEl.addEventListener('change', () => {
    persist({ ...config.petChat, enabled: enabledEl.checked })
  })
  intervalEl.addEventListener('change', () => {
    persist({ ...config.petChat, intervalMinutes: intervalEl.value })
  })
  quietEl.addEventListener('change', () => {
    persist({ ...config.petChat, quietMode: quietEl.checked })
  })
}

function initActivityPanel(getConfig) {
  const openBtn = document.getElementById('activity-log-open')
  const closeBtn = document.getElementById('activity-log-close')
  const panel = document.getElementById('activity-panel')
  if (!openBtn || !closeBtn || !panel) return

  openBtn.addEventListener('click', () => {
    renderActivityPanel(getConfig().activityLog || [])
    panel.classList.remove('hidden')
    window.alwaysHere.setClickThrough(false)
  })

  closeBtn.addEventListener('click', () => {
    panel.classList.add('hidden')
  })
}

function renderActivityPanel(log) {
  const summaryEl = document.getElementById('activity-summary')
  const chartEl = document.getElementById('activity-chart')
  const analysisEl = document.getElementById('activity-analysis')
  const listEl = document.getElementById('activity-list')
  const stats = summarizeActivityLog(log)

  summaryEl.replaceChildren(
    createSummaryItem('总记录', stats.total),
    createSummaryItem('喝水完成', stats.reminders.water.done),
    createSummaryItem('久坐完成', stats.reminders.sedentary.done),
    createSummaryItem('累计加班', formatDuration(stats.totalOvertimeMs))
  )

  chartEl.replaceChildren(
    createReminderBars('喝水', stats.reminders.water),
    createReminderBars('久坐', stats.reminders.sedentary)
  )

  analysisEl.textContent = buildActivityAnalysis(log)

  listEl.replaceChildren()
  const entries = [...log].reverse().slice(0, 80)
  if (!entries.length) {
    const empty = document.createElement('div')
    empty.className = 'activity-empty'
    empty.textContent = '暂无记录'
    listEl.appendChild(empty)
    return
  }
  for (const entry of entries) {
    const item = document.createElement('div')
    item.className = 'activity-entry'
    item.textContent = formatActivityEntry(entry)
    listEl.appendChild(item)
  }
}

function createSummaryItem(label, value) {
  const item = document.createElement('div')
  item.className = 'activity-summary-item'
  const valueEl = document.createElement('strong')
  valueEl.textContent = String(value)
  const labelEl = document.createElement('span')
  labelEl.textContent = label
  item.append(valueEl, labelEl)
  return item
}

function createReminderBars(label, stats) {
  const row = document.createElement('div')
  row.className = 'activity-bar-row'
  const title = document.createElement('span')
  title.textContent = label
  const track = document.createElement('div')
  track.className = 'activity-bar-track'
  const total = Math.max(1, stats.total)
  const done = createBarSegment('done', stats.done / total)
  const skipped = createBarSegment('skipped', stats.skipped / total)
  const timeout = createBarSegment('timeout', stats.timeout / total)
  track.append(done, skipped, timeout)
  const count = document.createElement('span')
  count.textContent = `${stats.done}/${stats.total}`
  row.append(title, track, count)
  return row
}

function createBarSegment(type, ratio) {
  const segment = document.createElement('div')
  segment.className = `activity-bar-segment ${type}`
  segment.style.width = `${Math.round(ratio * 100)}%`
  return segment
}

function ensureReminderConfig(config) {
  if (!config.reminders) config.reminders = {}
  const defaults = {
    hourly: { enabled: true, systemNotification: false },
    water: { enabled: true, intervalMinutes: 30, systemNotification: false },
    sedentary: { enabled: true, intervalMinutes: 60, systemNotification: false },
    work: { enabled: true, systemNotification: false }
  }
  for (const key in defaults) {
    config.reminders[key] = { ...defaults[key], ...(config.reminders[key] || {}) }
  }
  return config.reminders
}

function applyWidgetPositions(config) {
  for (const key in config.widgets) {
    const el = document.getElementById('widget-' + key)
    if (!el) continue
    el.classList.toggle('hidden', !config.widgets[key].enabled)
  }
}

function applyTheme(config) {
  document.body.className = config.theme ? 'theme-' + config.theme : ''
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === (config.theme || 'dark'))
  })
}
