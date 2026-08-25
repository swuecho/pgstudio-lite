import { memo, useState } from 'react'
import { ResultChart } from '../sql-editor/ResultChart'
import { CopyableCellValue } from '../shared/CopyableCellValue'
import { formatCell } from '../sql-editor/utils'
import { copyableCellDisplayProps } from '@/lib/format-uuid-display'
import { getChartConfig, setChartConfig } from '@/lib/notebook-chart-config'
import type { QueryResult } from '../sql-editor/types'

type CellResultProps = {
  result: QueryResult
  notebookId: string
  cellId: string
  /** Hide the Table/Chart toggle (used in read-only dashboard view). */
  hideToggle?: boolean
}

export const CellResult = memo(function CellResult({
  result,
  notebookId,
  cellId,
  hideToggle,
}: CellResultProps) {
  const [viewModes, setViewModes] = useState<Record<number, 'table' | 'chart'>>(() => {
    const initial: Record<number, 'table' | 'chart'> = {}
    result.statements.forEach((_, index) => {
      if (getChartConfig(notebookId, cellId, index)?.view === 'chart') initial[index] = 'chart'
    })
    return initial
  })

  const setView = (index: number, view: 'table' | 'chart') => {
    setViewModes((modes) => ({ ...modes, [index]: view }))
    const prev = getChartConfig(notebookId, cellId, index)
    setChartConfig(notebookId, cellId, index, { ...prev, view })
  }

  return (
    <div className="results-stack">
      {result.statements.map((statement, index) => (
        <div key={`${statement.command}-${index}`} className="result-block">
          <div className="result-block-head">
            <span>#{index + 1}</span>
            <span>{statement.command}</span>
            <span>{statement.rowCount} rows</span>
            {!hideToggle && statement.fields.length > 0 && statement.rows.length > 0 ? (
              <span className="result-view-toggle">
                <button
                  type="button"
                  className="btn small"
                  aria-pressed={(viewModes[index] ?? 'table') === 'table'}
                  onClick={() => setView(index, 'table')}
                >
                  Table
                </button>
                <button
                  type="button"
                  className="btn small"
                  aria-pressed={viewModes[index] === 'chart'}
                  onClick={() => setView(index, 'chart')}
                >
                  Chart
                </button>
              </span>
            ) : null}
          </div>
          {statement.fields.length === 0 ? (
            <div className="empty-state">Command executed successfully.</div>
          ) : viewModes[index] === 'chart' ? (
            <ResultChart
              fields={statement.fields}
              rows={statement.rows}
              initialConfig={getChartConfig(notebookId, cellId, index) ?? undefined}
              onConfigChange={(config) => {
                const prev = getChartConfig(notebookId, cellId, index)
                setChartConfig(notebookId, cellId, index, { view: prev?.view ?? 'chart', ...config })
              }}
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {statement.fields.map((field) => (
                      <th key={field}>{field}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {statement.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {statement.fields.map((field) => (
                        <td key={`${rowIndex}-${field}`}>
                          <CopyableCellValue {...copyableCellDisplayProps(formatCell(row[field]))} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
})
