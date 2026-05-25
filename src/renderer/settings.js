import {
  buildActivityAnalysis,
  exportActivityLogCsv,
  filterActivityLog,
  formatActivityEntry,
  formatDuration,
  summarizeRecentDays,
  summarizeActivityLog,
  getWeeklySummary
} from './utils/activityStats.mjs'
import {
  getSettingsModeSummary,
  getSettingsTitle,
  isSettingsRowVisible
} from './settingsScopes.mjs'
import { applyWidgetPositions, applyTheme } from './utils/config.js'
import { PET_CHAT_TONES, normalizePetChatSettings } from './widgets/petChatter.mjs'
import { showToast, showConfirm } from './utils/ui.mjs'

export function initSettings(getConfig, saveConfig) {
  const panel = document.getElementById('settings-panel')
  const title = document.getElementById('settings-title')
  const summary = document.getElementById('settings-mode-summary')
  const backGlobalBtn = document.getElementById('settings-back-global')
  const closeBtn = document.getElementById('settings-close')
  const headerCloseBtn = document.getElementById('settings-header-close')
  const petSelect = document.getElementById('setting-pet-select')
  const versionSpan = document.getElementById('app-version')
  const updateBtn = document.getElementById('check-update-btn')
  const resetConfigBtn = document.getElementById('reset-config-btn')

  // Load version
  window.alwaysHere.getAppVersion().then(version => {
    versionSpan.textContent = `v${version}`
  })

  updateBtn.addEventListener('click', async () => {
    const originalText = updateBtn.textContent
    updateBtn.textContent = '检查中...'
    updateBtn.disabled = true
    try {
      const res = await window.alwaysHere.checkHotUpdate()
      if (res && res.error) {
        showToast(res.error, 'error')
      }
    } catch (e) {
      showToast('更新检查失败: ' + e.message, 'error')
    } finally {
      updateBtn.textContent = originalText
      updateBtn.disabled = false
    }
  })

  resetConfigBtn?.addEventListener('click', async () => {
    const confirmed = await showConfirm('确定要恢复出厂设置吗？这将重置所有组件位置和您的个性化配置（如薪资、提醒等）。')
    if (!confirmed) return

    const success = await window.alwaysHere.resetConfig()
    if (success) {
      showToast('配置已重置，正在重启...', 'success')
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } else {
      showToast('恢复默认配置失败', 'error')
    }
  })

  const tabsContainer = document.getElementById('settings-tabs')
  const tabs = tabsContainer.querySelectorAll('.settings-tab')
  const tabContents = panel.querySelectorAll('.settings-tab-content')

  function switchTab(tabId) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId))
    tabContents.forEach(c => c.classList.toggle('active', c.dataset.tabContent === tabId))
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab))
  })

  function showPanel(mode = { type: 'global' }) {
    if (title) title.textContent = getSettingsTitle(mode)
    if (summary) summary.textContent = getSettingsModeSummary(mode)
    // Always show tabs, "Back to Global" is now redundant but kept for layout consistency if needed
    if (backGlobalBtn) backGlobalBtn.classList.toggle('hidden', true)
    
    panel.dataset.settingsMode = mode.type
    panel.dataset.widgetKey = mode.widgetKey || ''
    
    // Switch to appropriate tab
    if (mode.type === 'widget' && mode.widgetKey) {
      switchTab(mode.widgetKey)
    } else {
      switchTab('components')
    }
    
    document.querySelectorAll('.widget').forEach(widget => {
      widget.classList.toggle(
        'settings-target',
        mode.type === 'widget' && widget.dataset.widget === mode.widgetKey
      )
    })
    panel.classList.remove('hidden')
    window.alwaysHere.setClickThrough(false)
    
    // Always refresh pet manager when pet tab might be visited
    renderPetManager()
  }

  async function renderPetManager() {
    const listEl = document.getElementById('pet-manager-list')
    if (!listEl) return
    
    // Show loading state
    listEl.innerHTML = `
      <div class="pet-manager-loading">
        <div class="spinner"></div>
        <span>正在加载宠物库...</span>
      </div>
    `
    
    const pets = await window.alwaysHere.listPets()
    const config = getConfig()

    listEl.replaceChildren()
    if (pets.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'pet-manager-loading'
      empty.textContent = '未发现已安装的宠物'
      listEl.appendChild(empty)
      return
    }

    for (const pet of pets) {
      const card = document.createElement('div')
      card.className = `pet-card ${pet.id === config.petId ? 'active' : ''}`
      
      const preview = document.createElement('div')
      preview.className = 'pet-card-preview'
      const canvas = document.createElement('canvas')
      canvas.width = 130
      canvas.height = 150
      preview.appendChild(canvas)
      
      // Load and draw preview
      window.alwaysHere.getPetSpritesheet(pet.id).then(result => {
        const img = new Image()
        img.onload = () => {
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, 130, 150, 0, 0, 130, 150)
        }
        img.src = result.dataUrl
      })

      const name = document.createElement('div')
      name.className = 'pet-card-name'
      name.textContent = pet.displayName || pet.id

      const actions = document.createElement('div')
      actions.className = 'pet-card-actions'
      
      const useBtn = document.createElement('button')
      useBtn.className = 'pet-card-btn use-btn'
      useBtn.textContent = '使用'
      useBtn.onclick = async () => {
        config.petId = pet.id
        await saveConfig()
        if (petSelect) petSelect.value = pet.id
        window.dispatchEvent(new CustomEvent('pet-selection-changed'))
        renderPetManager()
      }

      const folderBtn = document.createElement('button')
      folderBtn.className = 'pet-card-btn'
      folderBtn.textContent = '文件夹'
      folderBtn.onclick = () => window.alwaysHere.openPetFolder(pet.id)

      const deleteBtn = document.createElement('button')
      deleteBtn.className = 'pet-card-btn delete'
      deleteBtn.textContent = '删除'
      deleteBtn.onclick = async () => {
        if (pet.id === 'hina') {
          showToast('内置宠物不能删除', 'error')
          return
        }
        if (!await showConfirm(`确定要删除宠物 ${pet.displayName || pet.id} 吗？`)) return
        const success = await window.alwaysHere.deletePet(pet.id)
        if (success) {
          showToast('已删除', 'success')
          if (config.petId === pet.id) {
            config.petId = 'hina'
            await saveConfig()
            window.dispatchEvent(new CustomEvent('pet-selection-changed'))
          }
          await refreshPetSelect(petSelect)
          renderPetManager()
        }
      }

      actions.append(useBtn, folderBtn, deleteBtn)
      card.append(preview, name, actions)
      listEl.appendChild(card)
    }
  }

  async function refreshPetSelect(select) {
    const pets = await window.alwaysHere.listPets()
    if (!select) return
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

  async function initPetSelect(select) {
    if (!select) return
    try {
      await refreshPetSelect(select)
      select.addEventListener('change', async () => {
        getConfig().petId = select.value
        await saveConfig()
        window.dispatchEvent(new CustomEvent('pet-selection-changed'))
        renderPetManager()
      })
    } catch (error) {
      console.warn('Failed to list pets:', error)
      select.disabled = true
    }
  }

  function initPetFolder() {
    const valueEl = document.getElementById('setting-pet-folder')
    const chooseBtn = document.getElementById('setting-pet-folder-choose')
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
      await refreshPetSelect(petSelect)
      renderPetManager()
      window.dispatchEvent(new CustomEvent('pet-selection-changed'))
    })
  }

  function initPetPackageImport() {
    const importBtn = document.getElementById('pet-package-import')
    const statusEl = document.getElementById('pet-package-import-status')
    const downloadLink = document.getElementById('pet-download-link')
    if (!importBtn || !statusEl) return

    downloadLink?.addEventListener('click', (event) => {
      event.preventDefault()
      window.alwaysHere.openExternal?.('https://codex-pets.net/')
    })

    importBtn.addEventListener('click', async () => {
      const originalText = importBtn.textContent
      importBtn.disabled = true
      importBtn.textContent = '导入中...'
      statusEl.textContent = ''
      try {
        const imported = await window.alwaysHere.importPetPackage()
        if (!imported) {
          statusEl.textContent = '已取消导入。'
          return
        }
        getConfig().petId = imported.id
        await saveConfig()
        await refreshPetSelect(petSelect)
        renderPetManager()
        window.dispatchEvent(new CustomEvent('pet-selection-changed'))
        statusEl.textContent = `已导入：${imported.displayName || imported.id}`
      } catch (error) {
        statusEl.textContent = error.message || '导入失败，请确认宠物包是否完整。'
      } finally {
        importBtn.disabled = false
        importBtn.textContent = originalText
      }
    })
  }

  function initReminderSettings() {
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

  function initPetChatSettings() {
    const enabledEl = document.getElementById('pet-chat-enabled')
    const intervalEl = document.getElementById('pet-chat-interval')
    const intervalVal = document.getElementById('pet-chat-interval-val')
    const quietEl = document.getElementById('pet-chat-quiet')
    const toneEl = document.getElementById('pet-chat-tone')
    if (!enabledEl || !intervalEl || !quietEl || !toneEl) return

    const config = getConfig()
    config.petChat = normalizePetChatSettings(config.petChat)
    toneEl.replaceChildren(...PET_CHAT_TONES.map(tone => {
      const option = document.createElement('option')
      option.value = tone.id
      option.textContent = tone.label
      return option
    }))

    function render() {
      const settings = normalizePetChatSettings(config.petChat)
      enabledEl.checked = settings.enabled
      intervalEl.value = settings.intervalMinutes
      if (intervalVal) intervalVal.textContent = settings.intervalMinutes
      intervalEl.disabled = !settings.enabled || settings.quietMode
      quietEl.checked = settings.quietMode
      toneEl.value = settings.tone
      toneEl.disabled = !settings.enabled
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
    intervalEl.addEventListener('input', () => {
      if (intervalVal) intervalVal.textContent = intervalEl.value
    })
    intervalEl.addEventListener('change', () => {
      persist({ ...config.petChat, intervalMinutes: intervalEl.value })
    })
    quietEl.addEventListener('change', () => {
      persist({ ...config.petChat, quietMode: quietEl.checked })
    })
    toneEl.addEventListener('change', () => {
      persist({ ...config.petChat, tone: toneEl.value })
    })

    return {
      toggleQuietMode() {
        const settings = normalizePetChatSettings(config.petChat)
        return persist({ ...settings, quietMode: !settings.quietMode })
      }
    }
  }

  function initActivityPanel() {
    const openBtn = document.getElementById('activity-log-open')
    const openBtnWageman = document.getElementById('activity-log-open-wageman')
    const closeBtn = document.getElementById('activity-log-close')
    const actPanel = document.getElementById('activity-panel')
    const filterEl = document.getElementById('activity-filter')
    const rangeEl = document.getElementById('activity-range')
    const exportBtn = document.getElementById('activity-log-export')
    const clearBtn = document.getElementById('activity-log-clear')

    // Essential elements for the panel to function
    if (!actPanel || !closeBtn || !filterEl || !rangeEl || !exportBtn || !clearBtn) return

    function getFilters() {
      return {
        type: filterEl.value,
        days: rangeEl.value === 'all' ? 'all' : Number(rangeEl.value)
      }
    }

    function openActivityPanel() {
      renderActivityPanel(getConfig().activityLog || [], getFilters())
      actPanel.classList.remove('hidden')
      window.alwaysHere.setClickThrough(false)
    }

    if (openBtn) openBtn.addEventListener('click', openActivityPanel)
    if (openBtnWageman) openBtnWageman.addEventListener('click', openActivityPanel)
    
    filterEl.addEventListener('change', openActivityPanel)
    rangeEl.addEventListener('change', openActivityPanel)
    
    exportBtn.addEventListener('click', async () => {
      const entries = filterActivityLog(getConfig().activityLog || [], getFilters())
      await window.alwaysHere.exportActivityLog?.(exportActivityLogCsv(entries))
    })
    clearBtn.addEventListener('click', async () => {
      if (!await showConfirm('确定清空所有行为记录吗？')) return
      getConfig().activityLog = []
      await saveConfig()
      openActivityPanel()
      showToast('记录已清空', 'success')
    })

    closeBtn.addEventListener('click', () => {
      actPanel.classList.add('hidden')
    })

    return {
      open: openActivityPanel
    }
  }

  function initWagemanSettings() {
    const clockInInput = document.getElementById('setting-wageman-clockin')
    const clockOutInput = document.getElementById('setting-wageman-clockout')
    const salaryInput = document.getElementById('setting-wageman-salary')
    const workDaysInput = document.getElementById('setting-wageman-workdays')
    const workDaysLabel = document.getElementById('setting-wageman-workdays-label')
    if (!clockInInput || !clockOutInput || !salaryInput || !workDaysInput) return

    const config = getConfig()
    const wc = config.wageman || {}
    
    clockInInput.value = wc.clockIn || '09:00'
    clockOutInput.value = wc.clockOut || '17:00'
    salaryInput.value = wc.monthlySalary || '8000'
    workDaysInput.value = wc.workDays || ''

    const saveInputs = () => {
      wc.clockIn = clockInInput.value
      wc.clockOut = clockOutInput.value
      wc.monthlySalary = salaryInput.value
      wc.workDays = workDaysInput.value
      saveConfig()
      window.dispatchEvent(new CustomEvent('wageman-settings-changed'))
    }

    clockInInput.addEventListener('change', saveInputs)
    clockOutInput.addEventListener('change', saveInputs)
    salaryInput.addEventListener('change', saveInputs)
    workDaysInput.addEventListener('change', () => {
      wc.workDaysAuto = false
      if (workDaysLabel) workDaysLabel.textContent = '工作日 (手动)'
      saveInputs()
    })

    window.addEventListener('wageman-workdays-autofilled', (e) => {
      workDaysInput.value = e.detail.workDays
      if (workDaysLabel) workDaysLabel.textContent = e.detail.label
    })
  }

  function initTimerSettings() {
    const workTimeInput = document.getElementById('setting-timer-worktime')
    const breakTimeInput = document.getElementById('setting-timer-breaktime')
    if (!workTimeInput || !breakTimeInput) return

    const config = getConfig()
    const timerSettings = config.widgets.timer

    workTimeInput.value = timerSettings.workTime || 25
    breakTimeInput.value = timerSettings.breakTime || 5

    const saveTimerSettings = async () => {
      timerSettings.workTime = Math.max(1, Number(workTimeInput.value) || 25)
      timerSettings.breakTime = Math.max(1, Number(breakTimeInput.value) || 5)
      workTimeInput.value = timerSettings.workTime
      breakTimeInput.value = timerSettings.breakTime
      await saveConfig()
      // Optional: notify timer widget if needed, 
      // but usually it's fine as it reads from config on next reset/start
    }

    workTimeInput.addEventListener('change', saveTimerSettings)
    breakTimeInput.addEventListener('change', saveTimerSettings)
  }

  // --- Start of initSettings execution ---

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

  backGlobalBtn?.addEventListener('click', () => showPanel({ type: 'global' }))

  const closeSettings = () => {
    panel.classList.add('hidden')
    document.querySelectorAll('.widget.settings-target').forEach(widget => {
      widget.classList.remove('settings-target')
    })
  }

  closeBtn.addEventListener('click', closeSettings)
  headerCloseBtn?.addEventListener('click', closeSettings)

  const widgetKeys = ['clock', 'pet', 'timer', 'note', 'wageman']
  widgetKeys.forEach(key => {
    const check = document.getElementById('setting-' + key)
    if (!check) return
    check.addEventListener('change', () => {
      getConfig().widgets[key].enabled = check.checked
      applyWidgetPositions()
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
      applyTheme()
      saveConfig()
    })
  })

  const scaleInput = document.getElementById('setting-global-scale')
  const scaleVal = document.getElementById('setting-global-scale-val')
  if (scaleInput) {
    scaleInput.value = getConfig().globalScale || 1.0
    if (scaleVal) scaleVal.textContent = scaleInput.value
    scaleInput.addEventListener('input', () => {
      const val = scaleInput.value
      if (scaleVal) scaleVal.textContent = val
      getConfig().globalScale = Number(val)
      applyScale(getConfig())
    })
    scaleInput.addEventListener('change', () => saveConfig())
  }

  const noteTransCheck = document.getElementById('setting-note-translucent')
  if (noteTransCheck) {
    noteTransCheck.checked = getConfig().noteTranslucent || false
    noteTransCheck.addEventListener('change', () => {
      getConfig().noteTranslucent = noteTransCheck.checked
      applyNoteStyle(getConfig())
      saveConfig()
    })
  }

  function applyScale(config) {
    const scale = config.globalScale || 1.0
    document.querySelectorAll('.widget').forEach(w => {
      w.style.transform = `scale(${scale})`
    })
  }

  function applyNoteStyle(config) {
    const note = document.getElementById('widget-note')
    if (note) note.classList.toggle('translucent', config.noteTranslucent)
  }

  // Initial apply
  applyScale(getConfig())
  applyNoteStyle(getConfig())

  initPetSelect(petSelect)
  initPetFolder()
  initPetPackageImport()
  initReminderSettings()
  initTimerSettings()
  const petChatSettings = initPetChatSettings()
  const activityPanel = initActivityPanel()
  initWagemanSettings()

  window.alwaysHere.onTrayCommand?.((command) => {
    const type = typeof command === 'string' ? command : command.type
    if (type === 'pet-say-now') {
      window.dispatchEvent(new CustomEvent('tray-command', { detail: command }))
    }
    if (type === 'toggle-pet-quiet-mode') {
      petChatSettings?.toggleQuietMode()
    }
    if (type === 'show-activity') {
      activityPanel?.open()
    }
  })

  function createWeeklyChart(data) {
    const maxEarned = Math.max(...data.map(d => d.earned), 1)
    return data.map(d => {
      const height = Math.round((d.earned / maxEarned) * 100)
      return `
        <div class="chart-column">
          <div class="chart-bar-wrapper">
            <div class="chart-bar" style="height: ${height}%"></div>
          </div>
          <div class="chart-label">${d.label}</div>
        </div>
      `
    }).join('')
  }

  function renderActivityPanel(log, filters = {}) {
    const filteredLog = filterActivityLog(log, filters)
    const config = getConfig()
    const summaryEl = document.getElementById('activity-summary')
    const recentEl = document.getElementById('activity-recent')
    const chartEl = document.getElementById('activity-chart')
    const analysisEl = document.getElementById('activity-analysis')
    const listEl = document.getElementById('activity-list')
    if (!summaryEl || !recentEl || !chartEl || !analysisEl || !listEl) return

    const stats = summarizeActivityLog(filteredLog)
    const recent = summarizeRecentDays(log, 7)
    const weeklyData = getWeeklySummary(log, config)

    recentEl.innerHTML = `
      <div class="activity-report">
        <div class="report-section">
          <div class="report-label">近 7 日薪资增长趋势</div>
          <div class="weekly-chart">${createWeeklyChart(weeklyData)}</div>
        </div>
        <div class="report-section-grid">
          <div class="report-stat">
            <span class="stat-label">身心平衡度</span>
            <strong class="stat-value">${config.happiness || 0}%</strong>
            <span class="stat-hint">${(config.happiness || 0) > 70 ? '平衡极佳' : (config.happiness || 0) > 40 ? '正常维持' : '急需休息'}</span>
          </div>
          <div class="report-stat">
            <span class="stat-label">本周专注时长</span>
            <strong class="stat-value">${weeklyData.reduce((acc, d) => acc + d.pomodoros, 0)}</strong>
            <span class="stat-hint">个番茄钟</span>
          </div>
        </div>
      </div>
    `

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

    analysisEl.textContent = buildActivityAnalysis(filteredLog)

    listEl.replaceChildren()
    const entries = [...filteredLog].reverse().slice(0, 80)
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

