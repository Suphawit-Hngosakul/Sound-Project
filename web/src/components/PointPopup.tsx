import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PointDetail } from '../api'
import { api, formatLocalTime, METRICS } from '../api'

interface Props {
  pointId: string
  tzOffsetMin: number
  onClose: () => void
}

// side panel รายละเอียดจุด — ครบ 15 คอลัมน์ เวลาท้องถิ่น dataset
export default function PointPopup({ pointId, tzOffsetMin, onClose }: Props) {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<PointDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDetail(null)
    setError(null)
    api.pointDetail(pointId).then(setDetail).catch((e) => setError(String(e)))
  }, [pointId])

  const fmt = (v: number | null, digits = 2) => (v === null || v === undefined ? '—' : v.toFixed(digits))

  return (
    <div className="popup-panel">
      <div className="popup-head">
        <span>{t('popup.title')}</span>
        <button className="link-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {!detail && !error && <div className="dim">{t('popup.loading')}</div>}
      {detail && (
        <table className="kv">
          <tbody>
            <tr>
              <td>{t('popup.id')}</td>
              <td>{detail._id}</td>
            </tr>
            <tr>
              <td>{t('popup.dataset')}</td>
              <td>{detail.dataset}</td>
            </tr>
            <tr>
              <td>{t('popup.device')}</td>
              <td>{detail.device ?? '—'}</td>
            </tr>
            <tr>
              <td>{t('popup.time')}</td>
              <td>{formatLocalTime(detail.timestamp, tzOffsetMin)}</td>
            </tr>
            <tr>
              <td>{t('popup.lat')}</td>
              <td>{detail.latitude !== null ? detail.latitude.toFixed(6) : '—'}</td>
            </tr>
            <tr>
              <td>{t('popup.lng')}</td>
              <td>{detail.longitude !== null ? detail.longitude.toFixed(6) : '—'}</td>
            </tr>
            <tr>
              <td>{t('popup.alt')}</td>
              <td>{fmt(detail.alt_m, 1)}</td>
            </tr>
            {METRICS.map((m) => (
              <tr key={m}>
                <td>{t(`metric.${m}`)}</td>
                <td>{fmt(detail[m])}</td>
              </tr>
            ))}
            <tr>
              <td>{t('popup.satellites')}</td>
              <td>{detail.satellites ?? '—'}</td>
            </tr>
            <tr>
              <td>{t('popup.gpsValid')}</td>
              <td>{detail.gps_valid ? t('popup.yes') : t('popup.no')}</td>
            </tr>
            <tr>
              <td>{t('popup.gpsInterpolated')}</td>
              <td>{detail.gps_interpolated ? t('popup.yes') : t('popup.no')}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
