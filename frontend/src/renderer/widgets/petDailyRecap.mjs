// 今日回顾(T1):把每天积累的行为数据变成伙伴的温暖反馈。
//
// 触发:每天首次"下班"或晚上 20:00 后首次互动,一天最多一次(用 lastRecapDate 去重)。
// 内容:基于 summarizeRecentDays(log, 1) 拼成 prompt,走小智 AI 生成个性化台词,
//       未启用语音时用本地模板。
//
// 设计原则:数据要变成反馈。冷冰冰的"喝水 2 次/番茄 3 个"要变成伙伴的一句关心。

import { summarizeRecentDays } from '../utils/activityStats.mjs'

const RECAP_HOUR_FALLBACK = 20 // 晚上未下班的人,20:00 后首次互动兜底回顾

// 生成 YYYY-M-D 形式的日期 key(用作 lastRecapDate 去重)
export function recapDateKey(now = new Date()) {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}

// 是否应该展示今日回顾。
// 触发条件(满足任一):
//   - trigger === 'work-stop'(下班,当天首次)
//   - trigger === 'scheduled' 且当前时间 >= 20:00(给不上班的人兜底)
// 去重:当天已经回顾过(lastRecapDate === 今天)则不再触发。
export function shouldShowDailyRecap(config, trigger, now = new Date()) {
  if (!config) return false
  const todayKey = recapDateKey(now)
  if (config.lastRecapDate === todayKey) return false

  if (trigger === 'work-stop') return true
  if (trigger === 'scheduled' && now.getHours() >= RECAP_HOUR_FALLBACK) return true
  return false
}

// 用今日活动统计构建回顾 prompt(供小智 LLM 用)。
// 返回 null 表示无可用数据(当天无任何行为记录),调用方据此决定是否改用本地问候。
export function buildRecapPrompt(config, now = new Date()) {
  const stats = summarizeRecentDays(config.activityLog || [], 1, now)
  // 当天完全没行为记录时,不强行编造回顾
  if (stats.entries === 0) return null

  const parts = []
  if (stats.pomodoroDone > 0) parts.push(`专注了${stats.pomodoroDone}个番茄钟`)
  if (stats.waterDone > 0) parts.push(`完成${stats.waterDone}次喝水提醒`)
  if (stats.workStops > 0) {
    const overtimeHours = Math.floor(stats.totalOvertimeMs / 3600000)
    if (overtimeHours > 0) parts.push(`加班约${overtimeHours}小时`)
    else parts.push('按时下班')
  }
  const happiness = config.happiness ?? 70

  const summary = parts.length > 0 ? `今天用户${parts.join('、')}。` : '今天用户没什么特别的行为记录。'
  return `你是一直陪在用户身边的桌面伙伴,现在是今天第一次做回顾。${summary}
用户当前好感度${happiness}。请像熟悉的伙伴一样,用一句话(25字以内)温暖地总结今天、关心用户。
不要机械罗列数字,不要提"番茄钟""喝水提醒"这些机制词,要自然。可以鼓励休息、表达陪伴。`
}

// 本地模板回顾(未启用语音时的兜底,或 AI 不可用时)
export function buildLocalRecap(config, now = new Date()) {
  const stats = summarizeRecentDays(config.activityLog || [], 1, now)
  if (stats.entries === 0) return '今天也要好好照顾自己哦~'

  if (stats.pomodoroDone >= 3) return `今天专注了${stats.pomodoroDone}个番茄钟,辛苦啦,记得放松一下~`
  if (stats.workStops > 0 && stats.totalOvertimeMs > 3600000) {
    const hrs = Math.floor(stats.totalOvertimeMs / 3600000)
    return `今天加班约${hrs}小时了,早点休息吧,别太拼~`
  }
  if (stats.workStops > 0) return '今天按时下班啦,辛苦了,好好休息~'
  if (stats.waterDone > 0) return '今天有好好喝水,继续保持哦~'
  return '今天也辛苦啦,我一直在~'
}
