(function setupBrowserPreview() {
  const previewEnabled = location.protocol.startsWith('http') && new URLSearchParams(location.search).has('preview')
  if (!previewEnabled || window.alwaysHere) return

  const previewConfig = {
    configVersion: 1,
    widgets: {
      clock: { enabled: true, x: 72, y: 58 },
      pet: { enabled: true, x: 560, y: 410 },
      timer: { enabled: true, x: 72, y: 560, mode: 'pomodoro', workTime: 25, breakTime: 5 },
      note: { enabled: true, x: 920, y: 78 },
      wageman: { enabled: true, x: 900, y: 550 }
    },
    alwaysOnTop: true,
    globalScale: 1,
    theme: 'cozy',
    petId: 'hina',
    petFolderPath: 'preview',
    reminders: {
      hourly: { enabled: false, systemNotification: false },
      water: { enabled: false, intervalMinutes: 30, systemNotification: false },
      sedentary: { enabled: false, intervalMinutes: 60, systemNotification: false },
      work: { enabled: false, systemNotification: false }
    },
    petChat: { enabled: false, intervalMinutes: 10, quietMode: true, tone: 'companion' },
    voice: { enabled: false },
    vision: { enabled: false, inactivitySeconds: 20 },
    happiness: 82,
    noteText: '今天先完成一个小目标。\n\n记得喝水、保存进度，也给自己留一点喘气的空间。',
    noteTranslucent: false,
    activityLog: [],
    wageman: {
      clockIn: '09:00', clockOut: '18:00', monthlySalary: '12000',
      workDays: '22', workDaysAuto: false, offWorkStops: {}
    }
  }

  async function spritesheetData() {
    const response = await fetch('assets/pets/hina/spritesheet.webp')
    const blob = await response.blob()
    const dataUrl = await new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
    return { id: 'hina', mimeType: 'image/webp', dataUrl }
  }

  const handlers = {
    getConfig: async () => previewConfig,
    saveConfig: async config => Object.assign(previewConfig, config),
    getAppVersion: async () => '1.3.1-preview',
    getAutoStart: async () => false,
    setAutoStart: async () => false,
    setClickThrough: async () => false,
    listPets: async () => [{ id: 'hina', displayName: 'Hina', description: '预览伙伴' }],
    getPetSpritesheet: spritesheetData,
    fetchHolidays: async () => null,
    voiceStatus: async () => ({ connected: false }),
    getConversationHistory: async () => ({ entries: [] }),
    getVisionHistory: async () => ({ entries: [] }),
    checkHotUpdate: async () => ({ success: true }),
    onShowSettings: () => {},
    onTrayCommand: () => {},
    onVoiceEvent: () => {}
  }

  window.alwaysHere = new Proxy(handlers, {
    get(target, property) {
      if (property in target) return target[property]
      return async () => false
    }
  })

  document.addEventListener('DOMContentLoaded', () => {
    document.body.style.background = previewConfig.theme === 'cozy' ? '#e9e1dc' : '#111426'
    document.addEventListener('click', event => {
      const themeButton = event.target.closest('.theme-btn')
      if (!themeButton) return
      document.body.style.background = themeButton.dataset.theme === 'cozy' ? '#e9e1dc' : '#111426'
    })
  })
})()
