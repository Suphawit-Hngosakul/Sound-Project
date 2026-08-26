import type { ComponentType, CSSProperties } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import * as ReactEChartsCoreModule from 'echarts-for-react/lib/core'
import type { EChartsOption } from 'echarts'

// ลงทะเบียนเฉพาะส่วนที่ใช้จริง — import echarts ทั้งก้อนทำ bundle บวมจาก 2.0 เป็น 3.3 MB
echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

interface CoreProps {
  echarts: unknown
  option: EChartsOption
  notMerge?: boolean
  style?: CSSProperties
}

// echarts-for-react/lib/core เป็น CommonJS และ vite prebundle มันเป็น `export default require_core()`
// ทำให้ได้ object ซ้อน default สองชั้น ({ default: { default: Component } })
// ถ้าเอาไปใช้ตรงๆ React พังทั้งหน้าด้วย "Element type is invalid" — tsc กับ vite build ไม่จับให้
// เพราะ type ถูกต้อง ผิดแค่ตอน runtime เลยต้องแกะจนกว่าจะเจอ component จริง
function unwrapComponent(mod: unknown): ComponentType<CoreProps> {
  let v: unknown = mod
  for (let i = 0; i < 4 && v && typeof v !== 'function'; i++) v = (v as { default?: unknown }).default
  if (typeof v !== 'function') throw new Error('echarts-for-react/lib/core: หา component ไม่เจอ')
  return v as ComponentType<CoreProps>
}

const ReactEChartsCore = unwrapComponent(ReactEChartsCoreModule)

export default function Chart({ option, height }: { option: EChartsOption; height: number }) {
  return <ReactEChartsCore echarts={echarts} option={option} notMerge style={{ height }} />
}
