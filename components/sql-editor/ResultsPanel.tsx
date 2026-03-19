import Link from 'next/link'
import styles from './ResultsPanel.module.css'
import type { CSSProperties } from 'react'
import { QueryResult } from './types'

type SqlResultsPanelProps = {
  result: QueryResult | null
  formatCell: (value: unknown) => string
  connectionName: string
  style?: CSSProperties
}

export function SqlResultsPanel({ result, formatCell, connectionName, style }: SqlResultsPanelProps) {
  return (
    <div className={styles.resultsWrap} style={style}>
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
                    Result payload capped at {statement.returnedRowCount} rows. Refine the query or open the table view.
                  </div>
                ) : null}
                {statement.fields.length > 0 ? (
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
                            {statement.fields.map((field) => (
                              <td key={`${rowIndex}-${field}`}>
                                <code>{formatCell(row[field])}</code>
                              </td>
                            ))}
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
    </div>
  )
}
