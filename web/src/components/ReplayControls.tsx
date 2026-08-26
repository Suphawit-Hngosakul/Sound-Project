import { useTranslation } from 'react-i18next'
import { formatLocalTime } from '../api'

const SPEEDS = [10, 60, 300, 1200]

interface Props {
  total: number | null // ความยาว timeline (ms) หลังตัดช่องว่างออก
  progress: number // ตำแหน่งบน timeline (ms)
  realTime: number // เวลาจริงที่ตรงกับ progress
  playing: boolean
  speed: number
  tzOffsetMin: number
  onPlayPause: () => void
  onSeek: (progress: number) => void
  onSpeed: (s: number) => void
}

function durationLabel(ms: number): string {
  const min = Math.round(ms / 60000)
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`
}

export default function ReplayControls({
  total,
  progress,
  realTime,
  playing,
  speed,
  tzOffsetMin,
  onPlayPause,
  onSeek,
  onSpeed,
}: Props) {
  const { t } = useTranslation()

  if (!total) return <div className="panel dim small">{t('replay.noTrack')}</div>

  return (
    <div className="panel">
      <div className="panel-title">{t('replay.title')}</div>
      <div className="row">
        <button className="btn play-btn" onClick={onPlayPause}>
          {playing ? '⏸' : '▶'}
        </button>
        <span className="replay-time">{formatLocalTime(realTime, tzOffsetMin)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={total}
        step={1000}
        value={progress}
        onChange={(e) => onSeek(+e.target.value)}
        style={{ width: '100%' }}
      />
      <div className="legend-labels">
        <span>{durationLabel(progress)}</span>
        <span className="dim">{t('replay.walked', { total: durationLabel(total) })}</span>
      </div>
      <div className="row">
        <span className="dim small">{t('replay.speed')}</span>
        <div className="seg">
          {SPEEDS.map((s) => (
            <button key={s} className={speed === s ? 'seg-btn active' : 'seg-btn'} onClick={() => onSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
