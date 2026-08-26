import { useTranslation } from 'react-i18next'
import type { TimeFilterState } from '../api'
import { minutesToHHMM } from '../api'

interface Props {
  dates: string[] // วันที่มีข้อมูลจริง
  value: TimeFilterState
  onChange: (f: TimeFilterState) => void
}

type Mode = 'all' | 'single' | 'range'

// filter วัน (เฉพาะวันมีข้อมูล) + ช่วงเวลาในวัน (slider คู่ 00:00–24:00)
export default function TimeFilter({ dates, value, onChange }: Props) {
  const { t } = useTranslation()
  const mode: Mode = !value.date ? 'all' : value.dateEnd && value.dateEnd !== value.date ? 'range' : 'single'

  const setMode = (m: Mode) => {
    if (m === 'all') onChange({ ...value, date: null, dateEnd: null })
    else if (m === 'single') onChange({ ...value, date: value.date ?? dates[0] ?? null, dateEnd: null })
    else onChange({ ...value, date: value.date ?? dates[0] ?? null, dateEnd: dates[dates.length - 1] ?? null })
  }

  return (
    <div className="panel">
      <div className="panel-title">{t('filter.title')}</div>
      <div className="seg">
        {(['all', 'single', 'range'] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? 'seg-btn active' : 'seg-btn'} onClick={() => setMode(m)}>
            {t(m === 'all' ? 'filter.allDays' : m === 'single' ? 'filter.singleDay' : 'filter.dateRange')}
          </button>
        ))}
      </div>

      {mode !== 'all' && (
        <div className="row">
          <select value={value.date ?? ''} onChange={(e) => onChange({ ...value, date: e.target.value })}>
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          {mode === 'range' && (
            <>
              <span className="dim">{t('filter.to')}</span>
              <select value={value.dateEnd ?? ''} onChange={(e) => onChange({ ...value, dateEnd: e.target.value })}>
                {dates
                  .filter((d) => !value.date || d >= value.date)
                  .map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
              </select>
            </>
          )}
        </div>
      )}

      <div className="time-slider">
        <label>
          {t('filter.timeOfDay')}: {minutesToHHMM(value.timeStart)} – {minutesToHHMM(value.timeEnd)}
        </label>
        <input
          type="range"
          min={0}
          max={1439}
          step={15}
          value={value.timeStart}
          onChange={(e) => {
            const v = Math.min(+e.target.value, value.timeEnd - 15)
            onChange({ ...value, timeStart: v })
          }}
        />
        <input
          type="range"
          min={0}
          max={1439}
          step={15}
          value={value.timeEnd}
          onChange={(e) => {
            const v = Math.max(+e.target.value, value.timeStart + 15)
            onChange({ ...value, timeEnd: v })
          }}
        />
      </div>
      <button className="link-btn" onClick={() => onChange({ date: null, dateEnd: null, timeStart: 0, timeEnd: 1439 })}>
        {t('filter.reset')}
      </button>
    </div>
  )
}
