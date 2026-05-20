import Link from 'next/link'
import { useState } from 'react'
import styles from './ResultsPanel.module.css'
import type { CSSProperties } from 'react'
import { QueryResult } from './types'
import { CellContentPanel } from '../shared/CellContentPanel'
import { CopyableCellValue } from '../shared/CopyableCellValue'
import { canOpenCellViewer } from '../../lib/format-cell-content'
import { copyableCellDisplayProps } from '../../lib/format-uuid-display'
import {
  buildResultExportFilename,
  downloadText,
  rowsToCsv,
  rowsToJson,
  rowsToTsv,
} from '../../lib/result-export'
import { formatExplainPlan } from './utils'

type StatementResult = QueryResult['statements'][number]

function isExplainStatement(statement: StatementResult) {
  return statement.command === 'EXPLAIN' || statement.fields.some((field) => /query plan/i.test(field))
}

function getExplainPlanText(statement: StatementResult) {
  const planField = statement.fields.find((field) => /query plan/i.test(field)) || statement.fields[0]
  if (!planField || statement.rows.length === 0) return ''
  return formatExplainPlan(statement.rows[0][planField])
}

function exportStatement(
  statement: StatementResult,
  statementIndex: number,
  format: 'csv' | 'json',
  formatCell: (value: unknown) => string
) {
  if (statement.fields.length === 0 || statement.rows.length === 0) return
  const content =
    format === 'csv'
      ? rowsToCsv(statement.fields, statement.rows, formatCell)
      : rowsToJson(statement.fields, statement.rows)
  downloadText(buildResultExportFilename('query-result', format, statementIndex), content, `text/${format}`)
}

async function copyStatementTsv(statement: StatementResult, formatCell: (value: unknown) => string) {
  if (statement.fields.length === 0 || statement.rows.length === 0) return
  await navigator.clipboard.writeText(rowsToTsv(statement.fields, statement.rows, formatCell))
}

type SqlResultsPanelProps = {
  result: QueryResult | null
  formatCell: (value: unknown) => string
  connectionName: string
  style?: CSSProperties
}

type SqlCellView = {
  statementIndex: number
  rowIndex: number
  field: string
  value: unknown
}

export function SqlResultsPanel({ result, formatCell, connectionName, style }: SqlResultsPanelProps) {
  const [cellView, setCellView] = useState<SqlCellView | null>(null)

  return (
    <div className={`${styles.resultsWrap} ${cellView ? styles.resultsWrapWithPanel : ''}`.trim()} style={style}>
      <div className={styles.resultsHead}>
        <span>Results</span>
        <span className="history-meta">{result ? `${result.totalRows} rows` : ''}</span>
      </div>
      <div className={styles.resultsBody}>
        {!result ? (
          <div className={styles.emptyState}>Run a query to see results.</div>
        ) : (
          <div className={styles.resultsStack}>
            {result.statements.map((statement, index) => (
              <div key={`${statement.command}-${index}`} className={styles.resultBlock}>
                <div className={styles.resultBlockHead}>
                  <span>#{index + 1}</span>
                  <span>{statement.command}</span>
                  <span>{statement.rowCount} rows</span>
                  {statement.truncated ? (
                    <span className={styles.resultNotice}>
                      Showing {statement.returnedRowCount} of {statement.rowCount}
                    </span>
                  ) : null}
                  {statement.fields.length > 0 &&
                  statement.rows.length > 0 &&
                  !isExplainStatement(statement) ? (
                    <div className={styles.resultExportActions}>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => exportStatement(statement, index, 'csv', formatCell)}
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => exportStatement(statement, index, 'json', formatCell)}
                      >
                        JSON
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => void copyStatementTsv(statement, formatCell)}
                      >
                        Copy TSV
                      </button>
                    </div>
                  ) : null}
                  {statement.tableTarget ? (
                    <Link
                      className={styles.resultOpenLink}
                      href={{
                        pathname: '/table-editor',
                        query: {
                          connectionName,
                          schema: statement.tableTarget.schema,
                          table: statement.tableTarget.table,
                        },
                      }}
                    >
                      Open in Table Editor
                    </Link>
                  ) : null}
                </div>
                {statement.truncated ? (
                  <div className={styles.resultAlert}>
                    Export includes {statement.returnedRowCount} displayed rows (capped at server limit).
                  </div>
                ) : null}
                {isExplainStatement(statement) ? (
                  <pre className={styles.explainPlan}>
                    {getExplainPlanText(statement) || 'No plan returned.'}
                  </pre>
                ) : statement.fields.length > 0 ? (
                  <div className={styles.tableWrap}>
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
                            {statement.fields.map((field) => {
                              const rawValue = row[field]
                              const isViewable = canOpenCellViewer(undefined, rawValue)
                              const isViewing =
                                cellView?.statementIndex === index &&
                                cellView.rowIndex === rowIndex &&
                                cellView.field === field
                              return (
                                <td
                                  key={`${rowIndex}-${field}`}
                                  className={isViewable ? styles.resultCellViewable : undefined}
                                  data-viewing={isViewing ? 'true' : undefined}
                                  title={isViewable ? 'Double-click to view full content' : undefined}
                                  onDoubleClick={() => {
                                    if (isViewable) {
                                      setCellView({
                                        statementIndex: index,
                                        rowIndex,
                                        field,
                                        value: rawValue,
                                      })
                                    }
                                  }}
                                >
                                  <CopyableCellValue
                                    {...copyableCellDisplayProps(formatCell(rawValue))}
                                  />
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className={styles.emptyState}>Command executed successfully.</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {cellView ? (
        <CellContentPanel
          columnName={cellView.field}
          value={cellView.value}
          contextLabel={`Row ${cellView.rowIndex + 1}`}
          onClose={() => setCellView(null)}
        />
      ) : null}
    </div>
  )
}
