export const WIDGET_LABELS = {
  clock: '时钟',
  pet: '宠物',
  timer: '秒表',
  note: '便签',
  wageman: '打工倒计时'
}

function parseScopes(scopeText = '') {
  return String(scopeText)
    .split(/\s+/)
    .map(scope => scope.trim())
    .filter(Boolean)
}

export function getSettingsTitle(mode = { type: 'global' }) {
  if (mode.type !== 'widget') return '设置'
  return `${WIDGET_LABELS[mode.widgetKey] || '组件'}设置`
}

export function getSettingsModeSummary(mode = { type: 'global' }) {
  if (mode.type !== 'widget') return '全局设置'
  return `正在编辑：${WIDGET_LABELS[mode.widgetKey] || '组件'}`
}

export function isSettingsRowVisible(scopeText, mode = { type: 'global' }) {
  if (mode.type !== 'widget') return true
  const scopes = parseScopes(scopeText)
  return scopes.includes('always') || scopes.includes(mode.widgetKey)
}
