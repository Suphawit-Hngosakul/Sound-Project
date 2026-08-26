import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import type { EChartsOption } from 'echarts'

// ลงทะเบียนเฉพาะส่วนที่ใช้จริง — import echarts ทั้งก้อนทำ bundle บวมจาก 2.0 เป็น 3.3 MB
echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

export default function Chart({ option, height }: { option: EChartsOption; height: number }) {
  return <ReactEChartsCore echarts={echarts} option={option} notMerge style={{ height }} />
}
