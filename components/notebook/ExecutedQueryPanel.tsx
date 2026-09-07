import { memo, useCallback, useMemo } from 'react'
import { copyTextToClipboard } from '@/lib/clipboard'
import { renderSqlWithInlineValues, type ExecutedQueryInfo } from '@/lib/notebook-params'
import styles from './NotebookPage.module.css'

type ExecutedQueryPanelProps = {
  info: ExecutedQueryInfo
}

function formatBoundValue(value: unknown) {
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return JSON.stringify(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Debug view of what Postgres actually ran for a SQL cell: the compiled text
 * with `$n` placeholders, each `{{key}}` with its bound value and type, and a
 * copyable rendering with the values inlined as literals.
 */
export const ExecutedQueryPanel = memo(function ExecutedQueryPanel({ info }: ExecutedQueryPanelProps) {
  const inlined = useMemo(() => renderSqlWithInlineValues(info.text, info.values), [info])
  const warnings = info.params.filter((param) => param.warning)

  const handleCopyCompiled = useCallback(() => {
    void copyTextToClipboard(info.text)
  }, [info.text])
  const handleCopyInlined = useCallback(() => {
    void copyTextToClipboard(inlined)
  }, [inlined])

  return (
    <details className={styles.executedQuery} data-testid="executed-query-panel">
      <summary className={styles.executedQuerySummary}>
        <span>Executed query</span>
        <span className="history-meta">
          {info.params.length} param{info.params.length === 1 ? '' : 's'}
        </span>
        {warnings.length ? (
          <span className="pill error">
            {warnings.length} warning{warnings.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </summary>
      <div className={styles.executedQueryBody}>
        <div className={styles.executedQuerySection}>
          <div className={styles.executedQueryHead}>
            <span className="history-meta">Sent to Postgres (values bound separately)</span>
            <button type="button" className="btn small" onClick={handleCopyCompiled}>
              Copy
            </button>
          </div>
          <pre className={styles.executedQuerySql}>{info.text}</pre>
        </div>

        <div className={styles.executedQuerySection}>
          <div className={styles.executedQueryHead}>
            <span className="history-meta">Bound values</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Placeholder</th>
                  <th>Key</th>
                  <th>Value</th>
                  <th>Type</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {info.params.map((param) => (
                  <tr key={param.key}>
                    <td>
                      <code>{param.placeholder}</code>
                    </td>
                    <td>
                      <code>{`{{${param.key}}}`}</code>
                    </td>
                    <td>
                      <code>{formatBoundValue(param.value)}</code>
                    </td>
                    <td>{param.valueType}</td>
                    <td>{param.source === 'widget' ? 'widget cell' : 'current input'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {warnings.length ? (
            <ul className={styles.executedQueryWarnings}>
              {warnings.map((param) => (
                <li key={param.key}>
                  <code>{`{{${param.key}}}`}</code> {param.warning}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className={styles.executedQuerySection}>
          <div className={styles.executedQueryHead}>
            <span className="history-meta">With values inlined (for reading or pasting into psql)</span>
            <button type="button" className="btn small" onClick={handleCopyInlined}>
              Copy
            </button>
          </div>
          <pre className={styles.executedQuerySql}>{inlined}</pre>
        </div>
      </div>
    </details>
  )
})
