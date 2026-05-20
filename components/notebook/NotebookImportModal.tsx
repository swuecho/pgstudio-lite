import type { NotebookSpecV1 } from '../../features/notebook/notebook.service'
import type { NotebookDiffSummary } from '../../lib/notebook-ui'
import styles from './NotebookImportModal.module.css'

type NotebookImportModalProps = {
  importMode: 'create' | 'replace' | 'upsert'
  setImportMode: (value: 'create' | 'replace' | 'upsert') => void
  importRawJson: string
  setImportRawJson: (value: string) => void
  isImporting: boolean
  isValidating: boolean
  importParseHint: { message: string; line: number | null; column: number | null } | null
  importValidationSnapshot: NotebookSpecV1 | null
  importValidationWarnings: string[]
  importDiffSummary: NotebookDiffSummary | null
  importErrorDetails: Array<{ path: string; message: string; code?: string }>
  canUseCurrentJson: boolean
  onClose: () => void
  onPaste: () => void
  onFormatJson: () => void
  onValidate: () => void
  onPreviewDiff: () => void
  onUseCurrentJson: () => void
  onImport: () => void
}

export function NotebookImportModal(props: NotebookImportModalProps) {
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Import notebook JSON">
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <strong>Import Notebook JSON</strong>
          <button className="btn small" onClick={props.onClose} disabled={props.isImporting}>
            Close
          </button>
        </div>
        <div className={styles.modalControls}>
          <label htmlFor="import-mode">Mode</label>
          <select
            id="import-mode"
            value={props.importMode}
            onChange={(event) => props.setImportMode(event.target.value as 'create' | 'replace' | 'upsert')}
            disabled={props.isImporting || props.isValidating}
          >
            <option value="create">create (new notebook)</option>
            <option value="replace">replace (active notebook)</option>
            <option value="upsert">upsert (id-aware)</option>
          </select>
          <button
            className="btn small"
            onClick={props.onPaste}
            disabled={props.isImporting || props.isValidating}
          >
            Paste
          </button>
          <button
            className="btn small"
            onClick={props.onFormatJson}
            disabled={props.isImporting || props.isValidating || !props.importRawJson.trim()}
          >
            Format JSON
          </button>
          <button
            className="btn small"
            onClick={props.onValidate}
            disabled={props.isImporting || props.isValidating || !props.importRawJson.trim()}
          >
            {props.isValidating ? 'Validating...' : 'Validate'}
          </button>
          <button
            className="btn small"
            onClick={props.onPreviewDiff}
            disabled={props.isImporting || props.isValidating || !props.importRawJson.trim()}
          >
            Preview Diff
          </button>
          <button
            className="btn small"
            onClick={props.onUseCurrentJson}
            disabled={props.isImporting || props.isValidating || !props.canUseCurrentJson}
          >
            Use Current JSON
          </button>
          <button
            className="btn small primary"
            onClick={props.onImport}
            disabled={props.isImporting || props.isValidating || !props.importRawJson.trim()}
          >
            {props.isImporting ? 'Importing...' : 'Import'}
          </button>
        </div>
        <textarea
          className={styles.importTextarea}
          value={props.importRawJson}
          onChange={(event) => props.setImportRawJson(event.target.value)}
          placeholder={`Paste notebook JSON here.\nTip: use docs/notebook-llm-prompt-template.md for LLM generation.`}
          disabled={props.isImporting || props.isValidating}
        />
        {props.importParseHint ? (
          <div className={`${styles.modalPanel} ${styles.error}`}>
            JSON parse error: {props.importParseHint.message}
            {props.importParseHint.line !== null && props.importParseHint.column !== null
              ? ` (line ${props.importParseHint.line}, col ${props.importParseHint.column})`
              : ''}
          </div>
        ) : null}
        {props.importValidationSnapshot ? (
          <div className={styles.modalPanel}>
            Validation snapshot: <strong>{props.importValidationSnapshot.title}</strong> ·{' '}
            {props.importValidationSnapshot.cells.length} cells
            {props.importValidationWarnings.length
              ? ` · ${props.importValidationWarnings.length} warning(s)`
              : ''}
          </div>
        ) : null}
        {props.importDiffSummary ? (
          <div className={styles.modalPanel}>
            Diff summary:
            <ul className={styles.modalList}>
              <li>Title changed: {props.importDiffSummary.titleChanged ? 'yes' : 'no'}</li>
              <li>Description changed: {props.importDiffSummary.descriptionChanged ? 'yes' : 'no'}</li>
              <li>Connection changed: {props.importDiffSummary.connectionChanged ? 'yes' : 'no'}</li>
              <li>Metadata changed: {props.importDiffSummary.metadataChanged ? 'yes' : 'no'}</li>
              <li>Added cells: {props.importDiffSummary.addedCellIds.length}</li>
              <li>Removed cells: {props.importDiffSummary.removedCellIds.length}</li>
              <li>Reordered common cells: {props.importDiffSummary.reorderedCellCount}</li>
              <li>Changed cell bodies: {props.importDiffSummary.changedCellContentIds.length}</li>
            </ul>
          </div>
        ) : null}
        {props.importErrorDetails.length ? (
          <div className={`${styles.modalPanel} ${styles.error}`}>
            <div>Validation errors:</div>
            <table className={styles.errorTable}>
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Message</th>
                  <th>Code</th>
                </tr>
              </thead>
              <tbody>
                {props.importErrorDetails.map((item, index) => (
                  <tr key={`${item.path}-${index}`}>
                    <td>
                      <code>{item.path || '-'}</code>
                    </td>
                    <td>{item.message || '-'}</td>
                    <td>{item.code || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}
