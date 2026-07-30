// 桌面挂件间的自定义事件总线(window CustomEvent)事件名常量。
//
// 各 widget 通过 window 派发/监听这些事件实现松耦合通信。
// 统一在此定义,避免字符串散落各处导致重命名遗漏/拼写错误。
//
// 用法:
//   import { PET_EVENTS } from '../utils/events.mjs'
//   window.dispatchEvent(new CustomEvent(PET_EVENTS.POMODORO_DONE))
//   window.addEventListener(PET_EVENTS.POMODORO_DONE, handler)

export const PET_EVENTS = Object.freeze({
  // ── 番茄钟(timer → pet) ──
  POMODORO_START: 'pomodoro-start',
  POMODORO_STOP: 'pomodoro-stop',
  POMODORO_DONE: 'pomodoro-done',

  // ── 打工倒计时(wageman → pet) ──
  WORK_STOP: 'work-stop',

  // ── 伙伴动作/表情(外部 → pet) ──
  PET_ACTION: 'pet-action',
  PET_EMOTE: 'pet-emote',
  PET_REMINDER: 'pet-reminder',

  // ── 伙伴气泡语音回复(petVoice → pet) ──
  PET_VOICE_REPLY: 'pet-voice-reply',
  PET_VOICE_SHOW_BAR: 'pet-voice-show-bar',
  PET_VOICE_SYSTEM_PROMPT: 'pet-voice-system-prompt',

  // ── 用户主动发言(petVoice → pet)用于加好感 ──
  PET_USER_MESSAGE: 'pet-user-message',

  // ── 设置变更(settings → 各 widget) ──
  PET_SELECTION_CHANGED: 'pet-selection-changed',
  REMINDER_SETTINGS_CHANGED: 'reminder-settings-changed',
  PET_CHAT_SETTINGS_CHANGED: 'pet-chat-settings-changed',
  VOICE_SETTINGS_CHANGED: 'voice-settings-changed',
  WAGEMAN_SETTINGS_CHANGED: 'wageman-settings-changed',
  WAGEMAN_WORKDAYS_AUTOFILLED: 'wageman-workdays-autofilled',

  // ── 拖拽(drag → pet) ──
  WIDGET_DRAG: 'widget-drag',
  WIDGET_DRAG_END: 'widget-drag-end',

  // ── widget 显隐/增删变更(config → drag) ──
  // drag.js 据此清空穿透命中检测的 DOM 缓存,保证动态增删节点后判断正确。
  WIDGETS_VISIBILITY_CHANGED: 'widgets-visibility-changed',

  // ── 托盘命令(主进程 → 渲染进程) ──
  TRAY_COMMAND: 'tray-command'
})
