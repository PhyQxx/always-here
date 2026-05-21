import { initConfig, getConfig, saveConfig, applyAll } from './utils/config.js'
import { initClickThrough, makeDraggable } from './utils/drag.js'
import { initClock } from './widgets/clock.js'
import { initPet } from './widgets/pet.js'
import { initTimer } from './widgets/timer.js'
import { initNote } from './widgets/note.js'
import { initWageman } from './widgets/wageman.js'
import { initSettings } from './settings.js'

async function init() {
  await initConfig()
  const config = getConfig()

  applyAll()
  initClickThrough()

  initClock()
  initPet(getConfig, saveConfig)
  initTimer()
  initNote(getConfig, saveConfig)
  initWageman(getConfig, saveConfig)

  const widgetKeys = ['clock', 'pet', 'timer', 'note', 'wageman']
  widgetKeys.forEach(key => {
    const el = document.getElementById('widget-' + key)
    if (el) makeDraggable(el, key, config, saveConfig)
  })

  initSettings(getConfig, saveConfig)
}

init()
