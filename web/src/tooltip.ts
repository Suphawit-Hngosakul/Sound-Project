import type { PickingInfo } from '@deck.gl/core'
import type { TFunction } from 'i18next'
import type { Metric, PointRow } from './api'
import { COL, formatLocalTime } from './api'

// @deck.gl/core ไม่ได้ export type นี้ออกมาจาก index — ประกาศให้ตรงโครงเอง
// (ใช้ `text` ไม่ใช่ `html` เพราะชื่อโซนมาจาก OSM/ผู้ใช้ — innerText ไม่มีปัญหา injection)
export type TooltipContent =
  | null
  | string
  | { text?: string; html?: string; className?: string; style?: Partial<CSSStyleDeclaration> }

export const POINTS_LAYER_ID = 'points'

interface PointTooltipOptions {
  // ค่าที่เปิดเป็น layer อยู่ — ขึ้นทุกตัวตามลำดับเดียวกับวงบนแผนที่
  metrics: Metric[]
  tzOffsetMin: number
  // id ของจุดที่เปิดรายละเอียดอยู่ — hover โดนตัวมันเองต้องบอกให้รู้ ไม่ใช่ชวนให้คลิกซ้ำ
  selectedId: string | null
}

// hover จุดวัด — บอกให้ชัดว่ากำลังชี้จุดไหน: เวลาท้องถิ่นของ dataset + ค่าที่กำลังไล่สีอยู่
// layer อื่นคืน null ปล่อยให้ tooltip ตัวถัดไปจัดการ
export function pointTooltip(t: TFunction, { metrics, tzOffsetMin, selectedId }: PointTooltipOptions) {
  return (info: PickingInfo): TooltipContent => {
    if (info.layer?.id !== POINTS_LAYER_ID || !info.object) return null
    const row = info.object as PointRow
    const lines = [formatLocalTime(row[COL.t] as number, tzOffsetMin)]
    for (const m of metrics) {
      const value = row[COL[m]] as number | null
      lines.push(`${t(`metric.${m}`)}: ${value === null ? '—' : value.toFixed(2)}`)
    }
    if (row[COL.interp] === 1) lines.push(t('map.interpolatedPoint'))
    lines.push(row[COL.id] === selectedId ? t('map.pointShowing') : t('map.pointClickHint'))
    return { text: lines.join('\n'), className: 'map-tooltip' }
  }
}

export const OVERVIEW_POINTS_LAYER_ID = 'overview-points'

// hover จุดในหน้าภาพรวม — จุดที่นี่ไล่สีตามชุดข้อมูล ไม่ใช่ตามค่าที่วัด
// สิ่งที่ต้องบอกคือ "จุดนี้ของชุดไหน เก็บตอนไหน" (เวลาท้องถิ่นของชุดนั้น ไม่ใช่ของเครื่องผู้ใช้)
export function overviewPointTooltip(t: TFunction, tzByDataset: Record<string, number>) {
  return (info: PickingInfo): TooltipContent => {
    if (info.layer?.id !== OVERVIEW_POINTS_LAYER_ID || !info.object) return null
    const { name, r } = info.object as { name: string; r: PointRow }
    return {
      text: `${name}
${formatLocalTime(r[COL.t] as number, tzByDataset[name] ?? 420)}
${t('overview.openDatasetHint')}`,
      className: 'map-tooltip',
    }
  }
}

// ต่อ tooltip หลายตัวเข้าด้วยกัน — ตัวแรกที่ตอบไม่ใช่ null ชนะ
export function firstTooltip(...fns: ((info: PickingInfo) => TooltipContent)[]) {
  return (info: PickingInfo): TooltipContent => {
    for (const fn of fns) {
      const out = fn(info)
      if (out) return out
    }
    return null
  }
}
