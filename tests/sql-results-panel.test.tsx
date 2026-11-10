// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const downloads = vi.hoisted(() => [] as Array<{ filename: string; content: string; mimeType: string }>)
vi.mock('@/lib/result-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/result-export')>()),
  downloadText: (filename: string, content: string, mimeType: string) => {
    downloads.push({ filename, content, mimeType })
  },
}))

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

  it('starts a CSV download with a UTF-8 byte-order mark so Excel reads non-Latin text', () => {
    downloads.length = 0
    render(
      <SqlResultsPanel
        result={makeResult(['name'], [{ name: '张三' }])}
        formatCell={(value) => String(value ?? '')}
        connectionName="localdev"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))

    expect(downloads).toHaveLength(1)
    expect(downloads[0].content).toBe('\uFEFFname\n张三')
    expect(downloads[0].mimeType).toBe('text/csv;charset=utf-8')
  })

  it('marks a row count as a lower bound when the server stopped at the display limit', () => {
    const result = makeResult(['n'], [{ n: 1 }])
    result.statements[0] = { ...result.statements[0], rowCount: 1, rowCountExact: false, truncated: true }
    render(<SqlResultsPanel result={result} formatCell={String} connectionName="localdev" />)

    expect(screen.getByText('1+ rows')).toBeInTheDocument()
    expect(screen.getByText('Showing first 1')).toBeInTheDocument()
  })
})
