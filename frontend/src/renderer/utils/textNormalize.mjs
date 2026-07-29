// 文本规范化工具(用于识别小智服务端回显的 stt 是否是本端注入的内部指令)。
//
// ⚠️ 强外部耦合:这里的首尾标点/空白剥离必须与小智服务端保持一致:
//    xiaozhi-server/.../textUtils.py:get_string_no_punctuation_or_emoji
//    (经 send_stt_message 应用到每条回显的 stt)
// 服务端逻辑变动时必须同步本文件,否则:
//  - 注入小智的内部 prompt(看屏幕、主动搭话等)会被 detect 模式原样回显为 stt
//  - 若两侧剥离不一致,结尾的 `。` 等会让精确匹配失败
//  - 导致内部指令被当作用户发言泄漏进气泡(显示成"🧑 你刚看到用户的屏幕:...")
//
// 长期目标:让服务端在回 stt 时附带 is_command 标记,前端无需镜像剥离逻辑。

// 首尾的空白 + 常见中英文标点(半角/全角)。emoji 因形态多变不在前端剥离,依赖服务端。
const STT_EDGE_TRIM = /^[\s\u3000,，.。!！?？:：;；“”"‘’'()（）【】\[\]、\-－～]+|[\s\u3000,，.。!！?？:：;；“”"‘’'()（）【】\[\]、\-－～]+$/g

export function normalizePrompt(text) {
  return (text || '').replace(STT_EDGE_TRIM, '').toLowerCase()
}
