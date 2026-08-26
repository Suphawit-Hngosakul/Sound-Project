import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { DatasetInfo } from './api'
import { api, DATASET_COLORS } from './api'
import OverviewPage from './pages/OverviewPage'
import DatasetPage from './pages/DatasetPage'
import ZonesPage from './pages/ZonesPage'
import DashboardPage from './pages/DashboardPage'
import './App.css'

function Navbar({ datasets }: { datasets: DatasetInfo[] }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const current = location.pathname.startsWith('/dataset/') ? decodeURIComponent(location.pathname.slice(9)) : ''

  const toggleLang = () => {
    const next = i18n.language === 'th' ? 'en' : 'th'
    i18n.changeLanguage(next)
    localStorage.setItem('lang', next)
  }

  return (
    <nav className="navbar">
      <span className="brand">{t('appTitle')}</span>
      <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
        {t('nav.overview')}
      </NavLink>
      <select
        className={current ? 'nav-select active' : 'nav-select'}
        value={current}
        onChange={(e) => e.target.value && navigate(`/dataset/${encodeURIComponent(e.target.value)}`)}
      >
        <option value="">{t('nav.datasets')}</option>
        {datasets.map((d) => (
          <option key={d.dataset} value={d.dataset}>
            {d.dataset}
          </option>
        ))}
      </select>
      <NavLink to="/zones" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
        {t('nav.zones')}
      </NavLink>
      <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
        {t('nav.dashboard')}
      </NavLink>
      <span className="spacer" />
      {current && <span className="nav-tag" style={{ background: DATASET_COLORS[current] }} />}
      <button className="lang-btn" onClick={toggleLang} title={t('nav.language')}>
        {i18n.language === 'th' ? 'EN' : 'ไทย'}
      </button>
    </nav>
  )
}

export default function App() {
  const { t } = useTranslation()
  const [datasets, setDatasets] = useState<DatasetInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .datasets()
      .then(setDatasets)
      .catch((e) => setError(String(e)))
  }, [])

  return (
    <div className="app-shell">
      <Navbar datasets={datasets ?? []} />
      <main className="page">
        {error && (
          <div className="page-pad">
            <div className="error">
              {t('error')}: {error}
            </div>
            <button className="btn" onClick={() => window.location.reload()}>
              {t('retry')}
            </button>
          </div>
        )}
        {!error && !datasets && <div className="page-pad dim">{t('loading')}</div>}
        {datasets && (
          <Routes>
            <Route path="/" element={<OverviewPage datasets={datasets} />} />
            <Route path="/dataset/:name" element={<DatasetPage datasets={datasets} />} />
            <Route path="/zones" element={<ZonesPage datasets={datasets} />} />
            <Route path="/dashboard" element={<DashboardPage datasets={datasets} />} />
          </Routes>
        )}
      </main>
    </div>
  )
}
