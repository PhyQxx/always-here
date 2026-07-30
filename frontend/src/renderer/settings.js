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
import { normalizeVoiceSettings, normalizeVisionSettings } from './widgets/voiceSettings.mjs'
import { normalizeReminders } from './widgets/petReminders.mjs'
import { showToast, showConfirm } from './utils/ui.mjs'
import { renderMarkdown } from './utils/markdown.mjs'
import { PET_EVENTS } from './utils/events.mjs'

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
        <span>正在加载伙伴库...</span>
      </div>
    `
    
    const pets = await window.alwaysHere.listPets()
    const config = getConfig()

    listEl.replaceChildren()
    if (pets.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'pet-manager-loading'
      empty.textContent = '未发现已安装的伙伴'
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
        window.dispatchEvent(new CustomEvent(PET_EVENTS.PET_SELECTION_CHANGED))
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
          showToast('内置伙伴不能删除', 'error')
          return
        }
        if (!await showConfirm(`确定要删除伙伴 ${pet.displayName || pet.id} 吗？`)) return
        const success = await window.alwaysHere.deletePet(pet.id)
        if (success) {
          showToast('已删除', 'success')
          if (config.petId === pet.id) {
            config.petId = 'hina'
            await saveConfig()
            window.dispatchEvent(new CustomEvent(PET_EVENTS.PET_SELECTION_CHANGED))
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
      option.textContent = '未找到本地伙伴'
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
        window.dispatchEvent(new CustomEvent(PET_EVENTS.PET_SELECTION_CHANGED))
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
      window.dispatchEvent(new CustomEvent(PET_EVENTS.PET_SELECTION_CHANGED))
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
        window.dispatchEvent(new CustomEvent(PET_EVENTS.PET_SELECTION_CHANGED))
        statusEl.textContent = `已导入：${imported.displayName || imported.id}`
      } catch (error) {
        statusEl.textContent = error.message || '导入失败，请确认伙伴包是否完整。'
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

    const reminders = normalizeReminders(getConfig().reminders)
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
        window.dispatchEvent(new CustomEvent(PET_EVENTS.REMINDER_SETTINGS_CHANGED, {
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
      window.dispatchEvent(new CustomEvent(PET_EVENTS.PET_CHAT_SETTINGS_CHANGED))
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

  function initVoiceSettings() {
    const enabledEl = document.getElementById('voice-enabled')
    const autoplayEl = document.getElementById('voice-autoplay')
    const urlEl = document.getElementById('voice-server-url')
    const apiUrlEl = document.getElementById('voice-api-url')
    const tokenEl = document.getElementById('voice-token')
    const keyEl = document.getElementById('voice-trigger-key')
    const keyHint = document.getElementById('voice-trigger-key-hint')
    const deviceIdEl = document.getElementById('voice-device-id')
    const ttsVoiceEl = document.getElementById('voice-tts-voice')
    const ttsVoiceHint = document.getElementById('voice-tts-voice-hint')
    const testBtn = document.getElementById('voice-test-connect')
    const testStatus = document.getElementById('voice-test-status')
    if (!enabledEl || !urlEl) return

    const config = getConfig()
    config.voice = normalizeVoiceSettings(config.voice)

    function render() {
      const s = normalizeVoiceSettings(config.voice)
      enabledEl.checked = s.enabled
      if (autoplayEl) autoplayEl.checked = s.autoPlayTTS
      urlEl.value = s.serverUrl
      if (apiUrlEl) apiUrlEl.value = s.apiUrl
      if (tokenEl) tokenEl.value = s.token
      if (keyEl) keyEl.value = s.triggerKey
      if (ttsVoiceEl) ttsVoiceEl.value = s.ttsVoice
      if (deviceIdEl) {
        deviceIdEl.textContent = s.deviceId ? s.deviceId.slice(0, 13) + '…' : '(未生成)'
      }
    }

    async function persist(next) {
      config.voice = normalizeVoiceSettings(next)
      render()
      await saveConfig()
      // 通知语音模块刷新可见性
      window.dispatchEvent(new CustomEvent(PET_EVENTS.VOICE_SETTINGS_CHANGED))
    }

    render()

    enabledEl.addEventListener('change', () => persist({ ...config.voice, enabled: enabledEl.checked }))
    if (autoplayEl) autoplayEl.addEventListener('change', () => persist({ ...config.voice, autoPlayTTS: autoplayEl.checked }))
    urlEl.addEventListener('change', () => persist({ ...config.voice, serverUrl: urlEl.value }))
    if (apiUrlEl) apiUrlEl.addEventListener('change', () => persist({ ...config.voice, apiUrl: apiUrlEl.value }))
    if (tokenEl) tokenEl.addEventListener('change', () => persist({ ...config.voice, token: tokenEl.value }))
    if (keyEl) {
      keyEl.addEventListener('change', async () => {
        await persist({ ...config.voice, triggerKey: keyEl.value.trim() })
        // 重新注册全局快捷键
        await window.alwaysHere.voiceReregisterShortcut()
        if (keyHint) {
          keyHint.textContent = '已更新快捷键'
          setTimeout(() => { if (keyHint) keyHint.textContent = '' }, 2000)
        }
      })
    }

    // 音色:保存后重连(voice 经 WS 查询参数下发,只在建连时生效)
    if (ttsVoiceEl) {
      ttsVoiceEl.addEventListener('change', async () => {
        await persist({ ...config.voice, ttsVoice: ttsVoiceEl.value })
        // voice 走查询参数,必须重连才生效
        await window.alwaysHere.voiceConnect()
        if (ttsVoiceHint) {
          ttsVoiceHint.textContent = '已切换,重连生效'
          setTimeout(() => { if (ttsVoiceHint) ttsVoiceHint.textContent = '' }, 2000)
        }
      })
    }

    // 测试连接
    if (testBtn) {
      testBtn.addEventListener('click', async () => {
        if (testStatus) testStatus.textContent = '连接中...'
        // 先确保启用并保存最新地址
        await persist({ ...config.voice, enabled: true })
        const res = await window.alwaysHere.voiceConnect()
        if (!res?.ok) {
          if (testStatus) testStatus.textContent = res?.error || '连接失败'
          return
        }
        // 等待 hello 回执
        let connected = false
        for (let i = 0; i < 30; i++) {
          const s = await window.alwaysHere.voiceStatus()
          if (s.connected) { connected = true; break }
          await new Promise((r) => setTimeout(r, 100))
        }
        if (testStatus) testStatus.textContent = connected ? '✓ 连接成功' : '✗ 超时,检查地址/服务端'
      })
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

  function initConversationPanel() {
    const openBtn = document.getElementById('conversation-history-open')
    const closeBtn = document.getElementById('conversation-history-close')
    const conversationPanel = document.getElementById('conversation-panel')
    const rangeEl = document.getElementById('conversation-range')
    const countEl = document.getElementById('conversation-count')
    const listEl = document.getElementById('conversation-list')
    const summaryBtn = document.getElementById('conversation-summary-generate')
    const summaryEl = document.getElementById('conversation-summary')
    // 总结区与对话列表共同的滚动容器(总结区在顶部,生成后需滚动到可见)
    const bodyEl = summaryEl?.parentElement
    if (!openBtn || !closeBtn || !conversationPanel || !rangeEl || !listEl || !summaryBtn || !summaryEl) return

    function formatConversationTime(timestamp) {
      const date = new Date(timestamp)
      if (Number.isNaN(date.getTime())) return ''
      return new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }).format(date)
    }

    function renderEntries(entries) {
      listEl.replaceChildren()
      if (countEl) countEl.textContent = `${entries.length} 条消息`
      if (!entries.length) {
        const empty = document.createElement('div')
        empty.className = 'conversation-empty'
        empty.textContent = '这段时间还没有对话，去和伙伴聊两句吧。'
        listEl.appendChild(empty)
        return
      }
      for (const entry of entries) {
        const item = document.createElement('article')
        item.className = `conversation-message ${entry.role === 'user' ? 'user' : 'assistant'}`
        const meta = document.createElement('div')
        meta.className = 'conversation-message-meta'
        meta.textContent = `${entry.role === 'user' ? '你' : '伙伴'} · ${formatConversationTime(entry.timestamp)}`
        const text = document.createElement('div')
        text.className = 'conversation-message-text'
        text.textContent = entry.text
        item.append(meta, text)
        listEl.appendChild(item)
      }
      listEl.lastElementChild?.scrollIntoView({ block: 'end' })
    }

    async function loadEntries({ resetSummary = false } = {}) {
      if (resetSummary) {
        summaryEl.classList.add('hidden')
        summaryEl.classList.remove('is-error', 'md-body')
        summaryEl.textContent = ''
      }
      listEl.innerHTML = '<div class="conversation-empty">正在读取对话…</div>'
      const result = await window.alwaysHere.getConversationHistory({ days: rangeEl.value })
      if (!result?.ok) {
        renderEntries([])
        showToast(result?.error || '读取对话记录失败', 'error')
        return
      }
      renderEntries(result.entries || [])
    }

    openBtn.addEventListener('click', async () => {
      conversationPanel.classList.remove('hidden')
      window.alwaysHere.setClickThrough(false)
      await loadEntries()
    })
    closeBtn.addEventListener('click', () => conversationPanel.classList.add('hidden'))
    rangeEl.addEventListener('change', () => loadEntries({ resetSummary: true }))

    summaryBtn.addEventListener('click', async () => {
      const originalText = summaryBtn.textContent
      summaryBtn.disabled = true
      summaryBtn.textContent = '总结中…'
      summaryEl.classList.remove('hidden', 'is-error', 'md-body')
      summaryEl.textContent = '伙伴正在整理这段对话…'
      // 总结区在列表顶部,先滚动到顶部让用户看到"总结中"状态
      bodyEl?.scrollTo({ top: 0, behavior: 'smooth' })
      try {
        const result = await window.alwaysHere.summarizeConversation({ days: rangeEl.value })
        if (!result?.ok) throw new Error(result?.error || 'AI 总结失败')
        summaryEl.classList.remove('is-error')
        // 渲染 Markdown(加 md-body 取消 pre-wrap)
        summaryEl.classList.add('md-body')
        summaryEl.innerHTML = renderMarkdown(result.text)
        // 生成完毕后再次确保滚动到总结区(等待时间可能让用户离开了顶部)
        bodyEl?.scrollTo({ top: 0, behavior: 'smooth' })
      } catch (error) {
        // 在面板内直接展示错误(顶部 toast 可能被本面板遮挡),便于用户看到原因
        summaryEl.classList.remove('md-body')
        summaryEl.classList.remove('hidden')
        summaryEl.classList.add('is-error')
        summaryEl.textContent = error.message || 'AI 总结失败'
        bodyEl?.scrollTo({ top: 0, behavior: 'smooth' })
        showToast(error.message || 'AI 总结失败', 'error')
      } finally {
        summaryBtn.disabled = false
        summaryBtn.textContent = originalText
      }
    })

    // 清空对话历史:确认后删除,并刷新列表
    const clearBtn = document.getElementById('conversation-clear')
    clearBtn?.addEventListener('click', async () => {
      if (!await showConfirm('确定清空全部对话历史吗？此操作不可恢复。')) return
      clearBtn.disabled = true
      const result = await window.alwaysHere.clearConversationHistory()
      clearBtn.disabled = false
      if (!result?.ok) {
        showToast(result?.error || '清空失败', 'error')
        return
      }
      showToast(`已清空 ${result.removed || 0} 条对话`, 'success')
      await loadEntries({ resetSummary: true })
    })
  }

  // 屏幕观察记录面板:查看 / 刷新 / 清空(隐私敏感数据,用户可管)
  function initVisionPanel() {
    const openBtn = document.getElementById('vision-history-open')
    const closeBtn = document.getElementById('vision-history-close')
    const panel = document.getElementById('vision-panel')
    const rangeEl = document.getElementById('vision-range')
    const countEl = document.getElementById('vision-count')
    const listEl = document.getElementById('vision-list')
    const refreshBtn = document.getElementById('vision-refresh')
    const clearBtn = document.getElementById('vision-clear')
    if (!closeBtn || !panel || !rangeEl || !listEl) return

    function formatTime(timestamp) {
      const date = new Date(timestamp)
      if (Number.isNaN(date.getTime())) return ''
      return new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).format(date)
    }

    function renderEntries(entries) {
      listEl.replaceChildren()
      if (countEl) countEl.textContent = `${entries.length} 条观察`
      if (!entries.length) {
        const empty = document.createElement('div')
        empty.className = 'conversation-empty'
        empty.textContent = '这段时间没有屏幕观察记录。'
        listEl.appendChild(empty)
        return
      }
      // 倒序展示(最新在最上),便于查看最近的观察
      for (const entry of [...entries].reverse()) {
        const item = document.createElement('article')
        item.className = 'conversation-message assistant'
        const meta = document.createElement('div')
        meta.className = 'conversation-message-meta'
        const source = entry.source ? ` · ${entry.source}` : ''
        meta.textContent = `${formatTime(entry.timestamp)}${source}`
        const text = document.createElement('div')
        text.className = 'conversation-message-text'
        text.textContent = entry.text
        item.append(meta, text)
        listEl.appendChild(item)
      }
    }

    async function loadEntries() {
      listEl.innerHTML = '<div class="conversation-empty">正在读取屏幕观察记录…</div>'
      const result = await window.alwaysHere.getVisionHistory({ days: rangeEl.value })
      if (!result?.ok) {
        renderEntries([])
        showToast(result?.error || '读取屏幕观察记录失败', 'error')
        return
      }
      renderEntries(result.entries || [])
    }

    openBtn?.addEventListener('click', async () => {
      panel.classList.remove('hidden')
      window.alwaysHere.setClickThrough(false)
      await loadEntries()
    })
    closeBtn.addEventListener('click', () => panel.classList.add('hidden'))
    rangeEl.addEventListener('change', loadEntries)
    refreshBtn?.addEventListener('click', loadEntries)
    clearBtn?.addEventListener('click', async () => {
      if (!await showConfirm('确定清空全部屏幕观察记录吗？此操作不可恢复。')) return
      clearBtn.disabled = true
      const result = await window.alwaysHere.clearVisionHistory()
      clearBtn.disabled = false
      if (!result?.ok) {
        showToast(result?.error || '清空失败', 'error')
        return
      }
      showToast(`已清空 ${result.removed || 0} 条观察记录`, 'success')
      await loadEntries()
    })
  }

  function initWorkReportPanel() {
    const openBtn = document.getElementById('work-report-open')
    const closeBtn = document.getElementById('work-report-close')
    const panel = document.getElementById('work-report-panel')
    const rangeEl = document.getElementById('work-report-range')
    const countEl = document.getElementById('work-report-count')
    const generateBtn = document.getElementById('work-report-generate')
    const copyBtn = document.getElementById('work-report-copy')
    const outputEl = document.getElementById('work-report-output')
    const bodyEl = outputEl?.parentElement
    if (!openBtn || !closeBtn || !panel || !rangeEl || !generateBtn || !outputEl) return

    // 记录最近一次生成的原始 Markdown 文本,供"复制"使用(渲染后会变成 HTML)
    let lastReportText = ''

    function resetOutput() {
      outputEl.classList.add('hidden', 'is-error')
      outputEl.classList.remove('md-body')
      outputEl.textContent = ''
      lastReportText = ''
      if (copyBtn) copyBtn.classList.add('hidden')
      if (countEl) countEl.textContent = ''
    }

    openBtn.addEventListener('click', () => {
      panel.classList.remove('hidden')
      window.alwaysHere.setClickThrough(false)
    })
    closeBtn.addEventListener('click', () => panel.classList.add('hidden'))
    rangeEl.addEventListener('change', resetOutput)

    generateBtn.addEventListener('click', async () => {
      const originalText = generateBtn.textContent
      generateBtn.disabled = true
      generateBtn.textContent = '生成中…'
      outputEl.classList.remove('hidden', 'is-error', 'md-body')
      outputEl.textContent = '伙伴正在整理你的工作汇报…'
      if (copyBtn) copyBtn.classList.add('hidden')
      bodyEl?.scrollTo({ top: 0, behavior: 'smooth' })
      try {
        const result = await window.alwaysHere.generateWorkReport({ range: rangeEl.value })
        if (!result?.ok) throw new Error(result?.error || '生成汇报失败')
        lastReportText = result.text || ''
        outputEl.classList.remove('is-error')
        // 渲染 Markdown:加 md-body 取消 pre-wrap,用 innerHTML 注入转义后的安全 HTML
        outputEl.classList.add('md-body')
        outputEl.innerHTML = renderMarkdown(result.text)
        if (countEl && result.count) countEl.textContent = `基于 ${result.count} 条记录`
        if (copyBtn) copyBtn.classList.remove('hidden')
        bodyEl?.scrollTo({ top: 0, behavior: 'smooth' })
      } catch (error) {
        outputEl.classList.remove('md-body')
        outputEl.classList.remove('hidden')
        outputEl.classList.add('is-error')
        outputEl.textContent = error.message || '生成汇报失败'
        bodyEl?.scrollTo({ top: 0, behavior: 'smooth' })
        showToast(error.message || '生成汇报失败', 'error')
      } finally {
        generateBtn.disabled = false
        generateBtn.textContent = originalText
      }
    })

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        // Electron 的 file:// 页面非安全上下文,navigator.clipboard 常不可用,需 execCommand 回退
        const text = lastReportText || outputEl.textContent || ''
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text)
          } else {
            throw new Error('clipboard API 不可用')
          }
        } catch {
          // 回退:临时 textarea + execCommand('copy'),在 Electron 渲染进程稳定可用
          try {
            const ta = document.createElement('textarea')
            ta.value = text
            ta.style.position = 'fixed'
            ta.style.opacity = '0'
            document.body.appendChild(ta)
            ta.select()
            document.execCommand('copy')
            document.body.removeChild(ta)
          } catch {
            showToast('复制失败，请手动选择文本', 'error')
            return
          }
        }
        showToast('已复制到剪贴板', 'success')
      })
    }
  }

  function initVisionSettings() {
    const enabledEl = document.getElementById('vision-enabled')
    const inactivityEl = document.getElementById('vision-inactivity')
    const lookBtn = document.getElementById('vision-look-now')
    const statusEl = document.getElementById('vision-status')
    if (!enabledEl || !inactivityEl) return

    const config = getConfig()
    config.vision = normalizeVisionSettings(config.vision)

    function render() {
      const s = normalizeVisionSettings(config.vision)
      enabledEl.checked = s.enabled
      inactivityEl.value = s.inactivitySeconds
    }

    async function persist(next) {
      config.vision = normalizeVisionSettings(next)
      render()
      await saveConfig()
      // 同步“用户未回复”计时器到主进程
      if (config.vision.enabled && config.vision.inactivitySeconds > 0) {
        await window.alwaysHere.visionStartLoop(config.vision.inactivitySeconds)
      } else {
        await window.alwaysHere.visionStopLoop()
      }
    }

    render()
    enabledEl.addEventListener('change', () => persist({ ...config.vision, enabled: enabledEl.checked }))
    inactivityEl.addEventListener('change', () => persist({ ...config.vision, inactivitySeconds: Number(inactivityEl.value) || 0 }))

    if (lookBtn) {
      lookBtn.addEventListener('click', async () => {
        if (statusEl) statusEl.textContent = '正在看屏幕...'
        // 经托盘命令路由到 petVoice
        window.dispatchEvent(new CustomEvent(PET_EVENTS.TRAY_COMMAND, { detail: { type: 'vision-look' } }))
        setTimeout(() => { if (statusEl) statusEl.textContent = '' }, 3000)
      })
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
      window.dispatchEvent(new CustomEvent(PET_EVENTS.WAGEMAN_SETTINGS_CHANGED))
    }

    clockInInput.addEventListener('change', saveInputs)
    clockOutInput.addEventListener('change', saveInputs)
    salaryInput.addEventListener('change', saveInputs)
    workDaysInput.addEventListener('change', () => {
      wc.workDaysAuto = false
      if (workDaysLabel) workDaysLabel.textContent = '工作日 (手动)'
      saveInputs()
    })

    window.addEventListener(PET_EVENTS.WAGEMAN_WORKDAYS_AUTOFILLED, (e) => {
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

  // F9:时钟设置(显示秒 / 24小时制)
  function initClockSettings() {
    const secondsCheckbox = document.getElementById('setting-clock-seconds')
    const h24Checkbox = document.getElementById('setting-clock-24h')
    if (!secondsCheckbox && !h24Checkbox) return

    const config = getConfig()
    if (!config.widgets.clock) config.widgets.clock = {}
    const clockSettings = config.widgets.clock

    if (secondsCheckbox) {
      secondsCheckbox.checked = clockSettings.showSeconds !== false
      secondsCheckbox.addEventListener('change', async () => {
        clockSettings.showSeconds = secondsCheckbox.checked
        await saveConfig()
      })
    }
    if (h24Checkbox) {
      h24Checkbox.checked = clockSettings.use24h !== false
      h24Checkbox.addEventListener('change', async () => {
        clockSettings.use24h = h24Checkbox.checked
        await saveConfig()
      })
    }
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
      const config = getConfig()
      const nextTheme = btn.dataset.theme
      if (config.theme === nextTheme) return

      config.themeLayouts ||= {}
      config.themeLayouts[config.theme] = snapshotWidgetPositions(config)
      const nextLayout = config.themeLayouts[nextTheme] || getRecommendedLayout(nextTheme)
      Object.entries(nextLayout).forEach(([key, position]) => {
        if (!config.widgets[key]) return
        config.widgets[key].x = position.x
        config.widgets[key].y = position.y
      })
      config.theme = nextTheme
      applyTheme()
      applyWidgetPositions()
      saveConfig()
    })
  })

  function snapshotWidgetPositions(config) {
    return Object.fromEntries(
      Object.entries(config.widgets).map(([key, widget]) => [key, { x: widget.x, y: widget.y }])
    )
  }

  function getRecommendedLayout(theme) {
    const width = window.innerWidth
    const height = window.innerHeight
    const clampX = value => Math.max(24, Math.min(width - 320, Math.round(value)))
    const clampY = value => Math.max(24, Math.min(height - 250, Math.round(value)))
    const layouts = {
      ambient: {
        clock: { x: 72, y: 58 },
        note: { x: width - 360, y: 78 },
        timer: { x: 72, y: height - 300 },
        pet: { x: width * 0.5 - 65, y: height * 0.52 },
        wageman: { x: width - 350, y: height - 290 }
      },
      cozy: {
        clock: { x: 42, y: 72 },
        wageman: { x: 42, y: 360 },
        pet: { x: width * 0.5 - 65, y: height * 0.58 },
        timer: { x: width - 320, y: 70 },
        note: { x: width - 350, y: 430 }
      },
      neo: {
        clock: { x: 48, y: 70 },
        wageman: { x: width * 0.5 - 115, y: 70 },
        pet: { x: width * 0.5 - 65, y: height * 0.43 },
        note: { x: width - 340, y: 180 },
        timer: { x: width * 0.5 - 120, y: height - 250 }
      }
    }

    return Object.fromEntries(
      Object.entries(layouts[theme] || layouts.ambient)
        .map(([key, position]) => [key, { x: clampX(position.x), y: clampY(position.y) }])
    )
  }

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
  initClockSettings()
  const petChatSettings = initPetChatSettings()
  const activityPanel = initActivityPanel()
  initWagemanSettings()
  initVoiceSettings()
  initConversationPanel()
  initVisionPanel()
  initWorkReportPanel()
  initVisionSettings()

  window.alwaysHere.onTrayCommand?.((command) => {
    const type = typeof command === 'string' ? command : command.type
    if (type === 'pet-say-now') {
      window.dispatchEvent(new CustomEvent(PET_EVENTS.TRAY_COMMAND, { detail: command }))
    }
    if (type === 'toggle-pet-quiet-mode') {
      petChatSettings?.toggleQuietMode()
    }
    if (type === 'show-activity') {
      activityPanel?.open()
    }
    if (type === 'voice-toggle') {
      window.dispatchEvent(new CustomEvent(PET_EVENTS.TRAY_COMMAND, { detail: command }))
    }
    if (type === 'vision-look') {
      window.dispatchEvent(new CustomEvent(PET_EVENTS.TRAY_COMMAND, { detail: command }))
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
            <span class="stat-label">伙伴好感度</span>
            <strong class="stat-value">${config.happiness || 0}%</strong>
            <span class="stat-hint">${(config.happiness || 0) > 80 ? '关系亲密' : (config.happiness || 0) > 40 ? '渐渐熟悉' : '有点想念你'}</span>
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
