import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Chart from '../components/Chart'
import TableDetails from '../components/TableDetails'
import TimeFilter from '../components/TimeFilter'
import type { DatasetInfo, Histogram, Metric, StatBlock, ZoneStat } from '../api'
import { api, filterParams, METRICS } from '../api'
import type { TimeFilterState } from '../api'
import { histogramOption, hourLabels, lineOption, useChartTheme } from '../charts'

// รวม series รายชั่วโมงกลับเป็นสรุปก้อนเดียว — ค่าเฉลี่ยถ่วงน้ำหนักด้วยจำนวนจุดของแต่ละชั่วโมง
// (เท่ากับเรียก /api/stats ซ้ำโดยไม่ต้องยิงเพิ่มอีก 5 ครั้ง)
function summarize(blocks: StatBlock[]): StatBlock {
  const out: StatBlock = { key: null, count: 0, withCoords: 0, metrics: {} }
  for (const b of blocks) {
    out.count += b.count
    out.withCoords += b.withCoords
    for (const m of METRICS) {
      const s = b.metrics[m]
      if (!s) continue
      const cur = out.metrics[m]
      if (!cur) out.metrics[m] = { ...s }
      else {
        cur.min = Math.min(cur.min, s.min)
        cur.max = Math.max(cur.max, s.max)
        cur.avg = (cur.avg * cur.count + s.avg * s.count) / (cur.count + s.count)
        cur.count += s.count
      }
    }
  }
  return out
}

// series ค่าเฉลี่ยรายชั่วโมง 0–23 (ชั่วโมงที่ไม่มีข้อมูล = null ไม่ใช่ 0)
function hourlyAvg(blocks: StatBlock[], metric: Metric): (number | null)[] {
  const byHour = new Map(blocks.map((b) => [Number(b.key), b]))
  return Array.from({ length: 24 }, (_, h) => byHour.get(h)?.metrics[metric]?.avg ?? null)
}

const CHART_H = 220

export default function DashboardPage({ datasets }: { datasets: DatasetInfo[] }) {
  const { t } = useTranslation()
  const theme = useChartTheme()
  const [filter, setFilter] = useState<TimeFilterState>({ date: null, dateEnd: null, timeStart: 0, timeEnd: 1439 })
  const [tab, setTab] = useState(datasets[0]?.dataset ?? '')
  const [hourly, setHourly] = useState<Record<string, StatBlock[]>>({})
  const [histos, setHistos] = useState<Partial<Record<Metric, Histogram>>>({})
  const [zoneStats, setZoneStats] = useState<ZoneStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dates = useMemo(() => [...new Set(datasets.flatMap((d) => d.dates))].sort(), [datasets])
  const info = datasets.find((d) => d.dataset === tab)

  // รายชั่วโมงของทุก dataset ครั้งเดียว — ใช้ทั้งแท็บและส่วนเปรียบเทียบ
  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all(
      datasets.map((d) =>
        api.statsBy({ dataset: d.dataset, groupBy: 'hour', ...filterParams(filter) }).then((r) => [d.dataset, r] as const)
      )
    )
      .then((pairs) => setHourly(Object.fromEntries(pairs)))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [datasets, filter])

  useEffect(() => {
    api.zoneStats(filterParams(filter)).then(setZoneStats).catch(() => setZoneStats([]))
  }, [filter])

  useEffect(() => {
    if (!info) return
    setHistos({})
    Promise.all(
      info.metrics.map((m) => api.histogram({ dataset: info.dataset, metric: m, bins: '24', ...filterParams(filter) }).then((h) => [m, h] as const))
    )
      .then((pairs) => setHistos(Object.fromEntries(pairs)))
      .catch(() => setHistos({}))
  }, [info, filter])

  const summary = useMemo(() => summarize(hourly[tab] ?? []), [hourly, tab])
  const hours = hourLabels()

  const comparisons: { metric: Metric; names: string[] }[] = useMemo(
    () =>
      (['sound_db', 'temp_c', 'humidity_pct'] as Metric[])
        .map((metric) => ({ metric, names: datasets.filter((d) => d.metrics.includes(metric)).map((d) => d.dataset) }))
        .filter((c) => c.names.length > 1),
    [datasets]
  )

  const zoneRows = useMemo(() => [...zoneStats].filter((z) => z.count > 0).sort((a, b) => b.count - a.count), [zoneStats])
  const zoneMetrics = useMemo(() => METRICS.filter((m) => zoneRows.some((z) => z.metrics[m])), [zoneRows])

  return (
    <div className="page-pad dashboard">
      <h1>{t('dashboardPage.title')}</h1>

      <div className="dash-filter">
        <TimeFilter dates={dates} value={filter} onChange={setFilter} />
      </div>

      <div className="tabs">
        {datasets.map((d) => (
          <button key={d.dataset} className={d.dataset === tab ? 'tab active' : 'tab'} onClick={() => setTab(d.dataset)}>
            <span className="swatch" style={{ background: theme.datasetColor(d.dataset) }} />
            {d.dataset}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {/* ระหว่างโหลดใหม่ให้ค้างของเดิมไว้แบบจาง — ไม่ล้างหน้าจนเลย์เอาต์กระโดด */}
      {info && (
        <div className={loading ? 'refetching' : undefined}>
          <section className="tiles">
            <div className="tile">
              <div className="tile-label">{t('overview.points')}</div>
              <div className="tile-value">{summary.count.toLocaleString()}</div>
              <div className="dim small">
                {summary.withCoords.toLocaleString()} {t('overview.withCoords')}
              </div>
            </div>
            {info.metrics.map((m) => {
              const s = summary.metrics[m]
              return (
                <div className="tile" key={m}>
                  <div className="tile-label">{t(`metric.${m}`)}</div>
                  <div className="tile-value">{s ? s.avg.toFixed(1) : '—'}</div>
                  <div className="dim small">
                    {s ? `${t('zonesPage.min')} ${s.min.toFixed(1)} · ${t('zonesPage.max')} ${s.max.toFixed(1)}` : t('dashboardPage.noData')}
                  </div>
                </div>
              )
            })}
          </section>

          {!summary.count && <div className="dim">{t('dashboardPage.noData')}</div>}

          {info.metrics.map((m) => {
            const h = histos[m]
            const avg = hourlyAvg(hourly[tab] ?? [], m)
            return (
              <section className="chart-row" key={m}>
                <figure className="chart-card">
                  <figcaption>
                    {t('dashboardPage.byHour')} — {t(`metric.${m}`)}
                  </figcaption>
                  <Chart
                    height={CHART_H}
                    option={lineOption(theme, hours, [{ name: t(`metric.${m}`), color: theme.datasetColor(tab), data: avg }], {
                      valueFormatter: (v) => v.toFixed(1),
                    })}
                  />
                  <TableDetails
                    columns={[t('dashboardPage.hour'), t('zonesPage.avg')]}
                    rows={hours.map((hh, i) => [hh, avg[i] === null ? null : avg[i]!.toFixed(1)])}
                  />
                </figure>
                <figure className="chart-card">
                  <figcaption>
                    {t('dashboardPage.histogram')} — {t(`metric.${m}`)}
                  </figcaption>
                  {h && h.bins.length ? (
                    <>
                      <Chart height={CHART_H} option={histogramOption(theme, h.bins, theme.datasetColor(tab), t(`metric.${m}`))} />
                      <TableDetails
                        columns={[t('dashboardPage.range'), t('overview.points')]}
                        rows={h.bins.map((b) => [`${b.from.toFixed(1)} – ${b.to.toFixed(1)}`, b.count.toLocaleString()])}
                      />
                    </>
                  ) : (
                    <div className="dim small chart-empty">{t('dashboardPage.noData')}</div>
                  )}
                </figure>
              </section>
            )
          })}
        </div>
      )}

      <h2 className="section-head">{t('dashboardPage.compare')}</h2>
      {comparisons.map(({ metric, names }) => (
        <figure className="chart-card wide" key={metric}>
          <figcaption>
            {t(`metric.${metric}`)} — {t('dashboardPage.compareHint', { n: names.length })}
          </figcaption>
          <Chart
            height={260}
            option={lineOption(
              theme,
              hours,
              names.map((n) => ({ name: n, color: theme.datasetColor(n), data: hourlyAvg(hourly[n] ?? [], metric) })),
              { endLabels: names.length <= 4, valueFormatter: (v) => v.toFixed(1) }
            )}
          />
          <TableDetails
            columns={[t('dashboardPage.hour'), ...names]}
            rows={hours.map((hh, i) => [
              hh,
              ...names.map((n) => {
                const v = hourlyAvg(hourly[n] ?? [], metric)[i]
                return v === null ? null : v.toFixed(1)
              }),
            ])}
          />
        </figure>
      ))}

      <h2 className="section-head">{t('dashboardPage.zoneTable')}</h2>
      {!zoneRows.length && <div className="dim">{t('dashboardPage.noZoneData')}</div>}
      {zoneRows.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('zonesPage.name')}</th>
                <th>{t('zonesPage.category')}</th>
                <th className="num">{t('overview.points')}</th>
                {zoneMetrics.map((m) => (
                  <th key={m} className="num">
                    {t(`metric.${m}`)} ({t('zonesPage.avg')})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zoneRows.map((z) => (
                <tr key={String(z.zoneId)}>
                  <td>
                    <span className="swatch" style={{ background: z.color }} /> {z.name}
                  </td>
                  <td>{t(`zoneCategory.${z.category}`)}</td>
                  <td className="num">{z.count.toLocaleString()}</td>
                  {zoneMetrics.map((m) => (
                    <td key={m} className="num">
                      {z.metrics[m] ? z.metrics[m]!.avg.toFixed(1) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
