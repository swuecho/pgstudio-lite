// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const resultExport = vi.hoisted(() => ({ downloadBlob: vi.fn() }))
vi.mock('../lib/result-export', () => resultExport)

import { DataSection } from '../components/settings/sections/DataSection'
import { filenameFromContentDisposition } from '../features/settings/backup.service'

afterEach(() => {
  vi.unstubAllGlobals()
  resultExport.downloadBlob.mockReset()
})

describe('filenameFromContentDisposition', () => {
  it('reads the quoted filename', () => {
    expect(filenameFromContentDisposition('attachment; filename="meta-backup-20260102-030405.sqlite"')).toBe(
      'meta-backup-20260102-030405.sqlite'
    )
    expect(filenameFromContentDisposition(null)).toBeNull()
    expect(filenameFromContentDisposition('attachment')).toBeNull()
  })
})

describe('DataSection', () => {
  it('warns that the backup contains connection strings', () => {
    render(<DataSection />)
    expect(screen.getByText(/contains your saved connection strings/i)).toBeInTheDocument()
  })

  it('downloads the backup under the server-suggested filename', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="meta-backup-20260102-030405.sqlite"' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<DataSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Back up app data' }))

    expect(await screen.findByRole('status')).toHaveTextContent('meta-backup-20260102-030405.sqlite')
    expect(fetchMock).toHaveBeenCalledWith('/api/meta-backup')
    expect(resultExport.downloadBlob).toHaveBeenCalledTimes(1)
    const [filename, blob] = resultExport.downloadBlob.mock.calls[0] as [string, Blob]
    expect(filename).toBe('meta-backup-20260102-030405.sqlite')
    expect(blob.size).toBe(3)
  })

  it('shows the API error when the backup fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Internal server error', code: 'INTERNAL_ERROR' }), {
          status: 500,
        })
      )
    )

    render(<DataSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Back up app data' }))

    expect(await screen.findByText('Internal server error')).toBeInTheDocument()
    expect(resultExport.downloadBlob).not.toHaveBeenCalled()
  })
})
