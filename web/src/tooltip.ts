// @deck.gl/core ไม่ได้ export type นี้ออกมาจาก index — ประกาศให้ตรงโครงเอง
// (ใช้ `text` ไม่ใช่ `html` เพราะชื่อโซนมาจาก OSM/ผู้ใช้ — innerText ไม่มีปัญหา injection)
export type TooltipContent =
  | null
  | string
  | { text?: string; html?: string; className?: string; style?: Partial<CSSStyleDeclaration> }
