import { useState } from 'react'
import { downloadMetaBackup } from '@/features/settings/backup.service'

type BackupState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; filename: string }
  | { kind: 'error'; message: string }

export function DataSection() {
  const [state, setState] = useState<BackupState>({ kind: 'idle' })

  const backUp = async () => {
    setState({ kind: 'working' })
    try {
      const filename = await downloadMetaBackup()
      setState({ kind: 'done', filename })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <div className="modal-section">
      <div className="history-meta">Back up app data</div>
      <p className="modal-check">
        Saves a copy of PG Studio Lite&apos;s local database: query history, snippets, notebooks, table-editor
        views and saved connections. The file contains your saved connection strings, including any passwords
        in them, so keep it somewhere private.
      </p>
      <div className="history-actions">
        <button type="button" className="btn small" onClick={backUp} disabled={state.kind === 'working'}>
          {state.kind === 'working' ? 'Backing up…' : 'Back up app data'}
        </button>
        {state.kind === 'done' ? (
          <span className="modal-check" role="status">
            Backup ready: {state.filename}
          </span>
        ) : null}
      </div>
      {state.kind === 'error' ? <div className="modal-error">{state.message}</div> : null}
    </div>
  )
}
