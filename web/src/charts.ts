import { useEffect, useState } from 'react'
import type { EChartsOption } from 'echarts'
import { DATASET_COLORS, DATASET_COLORS_DARK } from './api'

// ธีมกราฟตามโหมดสว่าง/มืดของเครื่อง — ECharts ต้องได้สีเป็นค่าจริง ใช้ CSS variable ไม่ได้
export interface ChartTheme {
  dark: boolean
  text: string
  muted: string
  grid: string
  axis: string
  surface: string
  datasetColor: (name: string) => string
}

export function useChartTheme(): ChartTheme {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const colors = dark ? DATASET_COLORS_DARK : DATASET_COLORS
  return {
    dark,
    text: dark ? '#f2f4f7' : '#12151a',
    muted: '#898781',
    grid: dark ? '#2c2c2a' : '#e1e0d9',
    axis: dark ? '#383835' : '#c3c2b7',
    surface: dark ? '#1c1f26' : '#ffffff',
    datasetColor: (name) => colors[name] ?? (dark ? '#3987e5' : '#2a78d6'),
  }
}

const AXIS_FONT = 11

function baseGrid(theme: ChartTheme, legend: boolean) {
  return {
    grid: { left: 46, right: 16, top: legend ? 34 : 16, bottom: 28 },
    textStyle: { fontFamily: 'inherit', color: theme.text },
    tooltip: {
      backgroundColor: theme.surface,
      borderColor: theme.axis,
      textStyle: { color: theme.text, fontSize: 12 },
      extraCssText: 'box-shadow: 0 6px 18px -6px rgba(0,0,0,.25);',
    },
  }
}

function axisCommon(theme: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: theme.axis } },
    axisTick: { show: false },
    axisLabel: { color: theme.muted, fontSize: AXIS_FONT },
    splitLine: { lineStyle: { color: theme.grid, width: 1 } },
  }
}

export interface Series {
  name: string
  color: string
  data: (number | null)[]
}

// กราฟเส้นตามแกนเวลา — หลายชุดข้อมูลได้ แต่แกนค่าเดียวเสมอ (ห้าม dual axis)
export function lineOption(
  theme: ChartTheme,
  categories: string[],
  series: Series[],
  opts: { valueName?: string; showLegend?: boolean; endLabels?: boolean; valueFormatter?: (v: number) => string } = {}
): EChartsOption {
  const { showLegend = series.length > 1, endLabels = false, valueFormatter } = opts
  return {
    ...baseGrid(theme, showLegend),
    legend: showLegend
      ? { top: 0, left: 0, itemWidth: 14, itemHeight: 8, textStyle: { color: theme.text, fontSize: 12 } }
      : undefined,
    tooltip: {
      ...baseGrid(theme, showLegend).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: theme.axis } },
      valueFormatter: (v) => (v === null || v === undefined ? '—' : valueFormatter ? valueFormatter(v as number) : String(v)),
    },
    xAxis: { type: 'category', data: categories, boundaryGap: false, ...axisCommon(theme), splitLine: { show: false } },
    yAxis: { type: 'value', scale: true, ...axisCommon(theme) },
    series: series.map((s) => ({
      type: 'line' as const,
      name: s.name,
      data: s.data,
      color: s.color,
      showSymbol: false,
      symbolSize: 8,
      lineStyle: { width: 2 },
      connectNulls: false,
      // ป้ายชื่อท้ายเส้น — ตัวช่วยที่สอง ไม่ให้ต้องอ่านจากสีอย่างเดียว (ทำได้เมื่อ <= 4 เส้น)
      endLabel: endLabels
        ? { show: true, color: theme.text, fontSize: 11, formatter: (p: { seriesName?: string }) => p.seriesName ?? '' }
        : undefined,
    })),
  }
}

// histogram — แท่งชิดกัน เว้นช่องว่าง 2px ให้เห็นขอบ ปลายแท่งมน 4px
export function histogramOption(
  theme: ChartTheme,
  bins: { from: number; to: number; count: number }[],
  color: string,
  label: string
): EChartsOption {
  return {
    ...baseGrid(theme, false),
    tooltip: {
      ...baseGrid(theme, false).tooltip,
      trigger: 'item',
      formatter: (p: unknown) => {
        const { dataIndex, value } = p as { dataIndex: number; value: number }
        const b = bins[dataIndex]
        return `${b.from.toFixed(1)} – ${b.to.toFixed(1)} ${label}<br/><b>${value.toLocaleString()}</b>`
      },
    },
    xAxis: {
      type: 'category',
      data: bins.map((b) => b.from.toFixed(b.to - b.from < 1 ? 1 : 0)),
      ...axisCommon(theme),
      splitLine: { show: false },
      axisLabel: { color: theme.muted, fontSize: AXIS_FONT, interval: Math.max(0, Math.floor(bins.length / 8)) },
    },
    yAxis: { type: 'value', ...axisCommon(theme) },
    series: [
      {
        type: 'bar' as const,
        data: bins.map((b) => b.count),
        color,
        barCategoryGap: '2%',
        // ช่องว่างระหว่างแท่งเป็นสีพื้น 2px — ไม่ใช่เส้นขอบสีเข้มรอบแท่ง
        itemStyle: { borderRadius: [4, 4, 0, 0], borderColor: theme.surface, borderWidth: 2 },
      },
    ],
  }
}

export function hourLabels(): string[] {
  return Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
}
