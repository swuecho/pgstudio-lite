// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SqlResultsPanel } from '@/components/sql-editor/ResultsPanel'
import type { QueryResult } from '@/components/sql-editor/types'

function makeResult(fields: string[], rows: Record<string, unknown>[]): QueryResult {
  return {
    connectionName: 'localdev',
    totalRows: rows.length,
    durationMs: 1,
    statements: [
      {
        command: 'SELECT',
        rowCount: rows.length,
        returnedRowCount: rows.length,
        truncated: false,
        fields,
        rows,
      },
    ],
  }
}

describe('SqlResultsPanel', () => {
  it('replaces the whole grid after a result that repeated a column name', () => {
    const formatCell = (value: unknown) => String(value ?? '')
    const first = makeResult(['id', 'source', 'source'], [{ id: 'a1', source: 'sycm-traffic' }])
    const second = makeResult(
      ['source'],
      [{ source: 'sycm-brand-mkt' }, { source: 'sycm-comments' }, { source: 'sycm-marketing' }]
    )

    const { container, rerender } = render(
      <SqlResultsPanel result={first} formatCell={formatCell} connectionName="localdev" />
    )
    rerender(<SqlResultsPanel result={second} formatCell={formatCell} connectionName="localdev" />)

    const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
    expect(headers).toEqual(['source'])
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => td.textContent)
    )
    expect(rows).toEqual([['sycm-brand-mkt'], ['sycm-comments'], ['sycm-marketing']])
  })
})
