// 挂件预设布局(T4):根据屏幕宽度选择合适的默认坐标。
//
// 现状:DEFAULT_WIDGETS 坐标写死,在 1280×800 笔记本上 note(920)/wageman(900) 会贴边甚至重叠。
// 虽然 applyWidgetPositions 有视口 clamp 兜底(溢出会被拉回),但 clamp 后的布局不美观。
// 这里提供两套预设:宽屏铺开 / 紧凑两列,首启时按屏幕宽度选一套。

// 宽屏布局(≥1600):沿用原坐标,左上时钟+秒表,中间伙伴,右上便签,右下打工
const WIDE_LAYOUT = {
  clock: { x: 72, y: 58 },
  pet: { x: 560, y: 410 },
  timer: { x: 72, y: 560 },
  note: { x: 920, y: 78 },
  wageman: { x: 900, y: 550 }
}

// 紧凑布局(<1600,常见笔记本 1366/1440/1536):
// 左列纵向 clock→timer,右列纵向 note→wageman,伙伴放中间偏下,避免拥挤
const COMPACT_LAYOUT = {
  clock: { x: 40, y: 40 },
  timer: { x: 40, y: 200 },
  pet: { x: 320, y: 360 },
  note: { x: 720, y: 40 },
  wageman: { x: 720, y: 320 }
}

const WIDE_BREAKPOINT = 1600

// 按屏幕宽度返回合适的布局坐标(不含 enabled 等其它字段,只含 x/y)。
// 纯函数,便于单测。
export function pickLayoutForScreen(width) {
  const w = Number(width)
  if (Number.isFinite(w) && w >= WIDE_BREAKPOINT) return WIDE_LAYOUT
  return COMPACT_LAYOUT
}

// 暴露常量供 T6(预设布局模式)复用
export const LAYOUTS = { WIDE_LAYOUT, COMPACT_LAYOUT, WIDE_BREAKPOINT }
