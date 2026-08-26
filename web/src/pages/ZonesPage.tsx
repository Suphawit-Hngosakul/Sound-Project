import { useTranslation } from 'react-i18next'

export default function ZonesPage() {
  const { t } = useTranslation()
  return (
    <div className="page-pad">
      <h1>{t('zonesPage.title')}</h1>
      <p className="dim">{t('zonesPage.wip')}</p>
    </div>
  )
}
