import { useTranslation } from 'react-i18next'

interface Props {
  columns: string[]
  rows: (string | number | null)[][]
}

// ตารางตัวเลขคู่กับกราฟ — ทุกค่าต้องอ่านได้โดยไม่ต้องพึ่ง hover หรือแยกสีอย่างเดียว
export default function TableDetails({ columns, rows }: Props) {
  const { t } = useTranslation()
  if (!rows.length) return null
  return (
    <details className="table-details">
      <summary>{t('dashboardPage.showTable')}</summary>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={c} className={i ? 'num' : undefined}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j} className={j ? 'num' : undefined}>
                    {v === null ? '—' : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
