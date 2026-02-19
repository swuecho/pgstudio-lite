import { QueryResult } from './types'

type SqlResultsPanelProps = {
  result: QueryResult | null
  formatCell: (value: unknown) => string
}

export function SqlResultsPanel({ result, formatCell }: SqlResultsPanelProps) {
  return (
    <div className="results-wrap">
      <div className="results-head">
        <span>Results</span>
        <span className="history-meta">{result ? `${result.totalRows} rows` : ''}</span>
      </div>
      <div className="results-body">
        {!result ? (
          <div className="empty-state">Run a query to see results.</div>
        ) : (
          <div className="results-stack">
            {result.statements.map((statement, index) => (
              <div key={`${statement.command}-${index}`} className="result-block">
                <div className="result-block-head">
                  <span>#{index + 1}</span>
                  <span>{statement.command}</span>
                  <span>{statement.rowCount} rows</span>
                </div>
                {statement.fields.length > 0 ? (
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
                                <code>{formatCell(row[field])}</code>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">Command executed successfully.</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
