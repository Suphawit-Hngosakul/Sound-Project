import { useTranslation } from 'react-i18next'
import type { Metric, Zone, ZoneStat } from '../api'
import { METRICS } from '../api'

interface Props {
  zone: Zone
  stat: ZoneStat | null
  loading: boolean
}

// min/avg/max ต่อ metric ของโซนที่เลือก — respect filter วัน/ช่วงเวลา (คำนวณฝั่ง server ด้วย $geoWithin)
export default function ZoneStatsTable({ zone, stat, loading }: Props) {
  const { t } = useTranslation()
  const present = METRICS.filter((m) => stat?.metrics[m])

  return (
    <div className="panel">
      <div className="panel-title">{t('zonesPage.stats')}</div>
      <div className="row">
        <span className="swatch" style={{ background: zone.color }} />
        <strong>{zone.name}</strong>
      </div>
      {loading && <div className="dim small">{t('loading')}</div>}
      {!loading && (!stat || !stat.count) && <div className="dim small">{t('zonesPage.noPoints')}</div>}
      {!loading && stat && stat.count > 0 && (
        <>
          <div className="dim small">{t('zonesPage.points', { n: stat.count.toLocaleString() })}</div>
          <table className="kv stats-table">
            <thead>
              <tr>
                <th />
                <th>{t('zonesPage.min')}</th>
                <th>{t('zonesPage.avg')}</th>
                <th>{t('zonesPage.max')}</th>
              </tr>
            </thead>
            <tbody>
              {present.map((m: Metric) => {
                const s = stat.metrics[m]!
                return (
                  <tr key={m}>
                    <td>{t(`metric.${m}`)}</td>
                    <td>{s.min.toFixed(1)}</td>
                    <td>{s.avg.toFixed(1)}</td>
                    <td>{s.max.toFixed(1)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
