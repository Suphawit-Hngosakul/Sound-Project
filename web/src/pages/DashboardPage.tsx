import { useTranslation } from 'react-i18next'

export default function DashboardPage() {
  const { t } = useTranslation()
  return (
    <div className="page-pad">
      <h1>{t('dashboardPage.title')}</h1>
      <p className="dim">{t('dashboardPage.wip')}</p>
    </div>
  )
}
