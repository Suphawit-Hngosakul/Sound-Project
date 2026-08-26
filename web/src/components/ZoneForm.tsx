import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Zone, ZoneCategory, ZoneInput } from '../api'
import { CATEGORY_COLOR, ZONE_CATEGORIES } from '../api'

interface Props {
  draft: { geometry: GeoJSON.Polygon } | Zone // โซนใหม่ที่เพิ่งวาด หรือโซนเดิมที่กำลังแก้
  onSave: (input: ZoneInput) => Promise<void>
  onCancel: () => void
}

export default function ZoneForm({ draft, onSave, onCancel }: Props) {
  const { t } = useTranslation()
  const existing = '_id' in draft ? draft : null
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ZoneCategory>('other')
  const [color, setColor] = useState(CATEGORY_COLOR.other)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // แตะสีเองแล้วห้ามให้การเปลี่ยนประเภททับสีที่เลือกไว้
  const [colorTouched, setColorTouched] = useState(false)

  useEffect(() => {
    setName(existing?.name ?? '')
    const cat = (existing?.category as ZoneCategory) ?? 'other'
    setCategory(cat)
    setColor(existing?.color ?? CATEGORY_COLOR[cat])
    setColorTouched(Boolean(existing))
    setError(null)
  }, [existing])

  const changeCategory = (c: ZoneCategory) => {
    setCategory(c)
    if (!colorTouched) setColor(CATEGORY_COLOR[c])
  }

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave({ name, category, color })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel zone-form">
      <div className="panel-title">{existing ? t('zonesPage.editZone') : t('zonesPage.newZone')}</div>
      <label className="field">
        <span className="dim small">{t('zonesPage.name')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('zonesPage.namePlaceholder')} autoFocus />
      </label>
      <label className="field">
        <span className="dim small">{t('zonesPage.category')}</span>
        <select value={category} onChange={(e) => changeCategory(e.target.value as ZoneCategory)}>
          {ZONE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`zoneCategory.${c}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="field row">
        <span className="dim small">{t('zonesPage.color')}</span>
        <input
          type="color"
          value={color}
          onChange={(e) => {
            setColor(e.target.value)
            setColorTouched(true)
          }}
        />
      </label>
      {error && <div className="error small">{error}</div>}
      <div className="row">
        <button className="btn" disabled={saving || !name.trim()} onClick={submit}>
          {saving ? t('zonesPage.saving') : t('zonesPage.save')}
        </button>
        <button className="link-btn" onClick={onCancel}>
          {t('zonesPage.cancel')}
        </button>
      </div>
    </div>
  )
}
