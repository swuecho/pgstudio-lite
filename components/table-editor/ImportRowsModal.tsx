import { useEffect, useMemo, useRef, useState } from 'react'
import { isBooleanColumn, isJsonColumn, isNumericColumn } from '@/lib/table-column-kind'
import { parseCsv } from '@/lib/csv-parse'
import type { ColumnInfo } from './types'
import styles from './ImportRowsModal.module.css'

type ImportRowsModalProps = {
  columns: ColumnInfo[]
  onClose: () => void
  onImport: (columns: string[], rows: unknown[][]) => Promise<{ inserted: number }>
}

const SKIP = ''
const PREVIEW_LIMIT = 5

type ParsedSource = {
  sourceColumns: string[]
  records: Record<string, unknown>[]
  error: string
}

function parseSource(text: string): ParsedSource {
  const trimmed = text.trim()
  if (!trimmed) return { sourceColumns: [], records: [], error: '' }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed)
      const arr = Array.isArray(data) ? data : [data]
      const objects = arr.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      )
      const sourceColumns: string[] = []
      const seen = new Set<string>()
      for (const obj of objects) {
        for (const key of Object.keys(obj)) {
          if (!seen.has(key)) {
            seen.add(key)
            sourceColumns.push(key)
          }
        }
      }
      return { sourceColumns, records: objects, error: '' }
    } catch {
      return { sourceColumns: [], records: [], error: 'Could not parse JSON.' }
    }
  }

  const { headers, rows } = parseCsv(trimmed)
  const records = rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
  )
  return { sourceColumns: headers, records, error: '' }
}

function coerceValue(raw: unknown, dataType: string): unknown {
  if (raw == null) return null
  // Values from JSON arrive already typed; let pg cast them.
  if (typeof raw !== 'string') return raw
  if (raw === '') return null
  if (isBooleanColumn(dataType)) {
    if (/^true$/i.test(raw)) return true
    if (/^false$/i.test(raw)) return false
    return null
  }
  if (isNumericColumn(dataType)) {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : raw
  }
  if (isJsonColumn(dataType)) {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
  return raw
}

function autoMatch(target: string, sourceColumns: string[]): string {
  const exact = sourceColumns.find((source) => source === target)
  if (exact) return exact
  const ci = sourceColumns.find((source) => source.toLowerCase() === target.toLowerCase())
  return ci || SKIP
}

export function ImportRowsModal({ columns, onClose, onImport }: ImportRowsModalProps) {
  const insertableColumns = useMemo(() => columns.filter((column) => !column.isIdentity), [columns])
  const [rawText, setRawText] = useState('')
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const parsed = useMemo(() => parseSource(rawText), [rawText])

  // Re-derive default column mapping whenever the source columns change.
  useEffect(() => {
    if (parsed.sourceColumns.length === 0) {
      setMapping({})
      return
    }
    setMapping(
      Object.fromEntries(
        insertableColumns.map((column) => [column.name, autoMatch(column.name, parsed.sourceColumns)])
      )
    )
  }, [parsed.sourceColumns, insertableColumns])

  const mappedColumns = insertableColumns.filter((column) => mapping[column.name])

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      setResult('')
      setError('')
      setRawText(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    setError('')
    setResult('')
    if (mappedColumns.length === 0) {
      setError('Map at least one column before importing.')
      return
    }
    if (parsed.records.length === 0) {
      setError('No rows to import.')
      return
    }
    const targetNames = mappedColumns.map((column) => column.name)
    const rows = parsed.records.map((record) =>
      mappedColumns.map((column) => coerceValue(record[mapping[column.name]], column.dataType))
    )
    setImporting(true)
    try {
      const response = await onImport(targetNames, rows)
      setResult(`Imported ${response.inserted} rows.`)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className={`modal-card ${styles.importModal}`}>
        <div className="modal-head">
          <div className="nav-title">Import rows</div>
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">
          <p className={styles.hint}>
            Paste CSV or JSON, or choose a file. The first CSV line is treated as the header. Blank cells
            import as NULL.
          </p>

          <div className={styles.sourceRow}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.json,text/csv,application/json"
              className={styles.fileInput}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
            <span className={styles.sourceMeta}>
              {parsed.sourceColumns.length > 0
                ? `${parsed.records.length} rows · ${parsed.sourceColumns.length} columns detected`
                : 'No data yet'}
            </span>
          </div>

          <textarea
            className={styles.pasteArea}
            value={rawText}
            placeholder={'id,name,amount\n1,Ada,42\n2,Linus,17'}
            onChange={(event) => {
              setResult('')
              setError('')
              setRawText(event.target.value)
            }}
          />

          {parsed.error ? <div className={styles.alert}>{parsed.error}</div> : null}

          {parsed.sourceColumns.length > 0 ? (
            <>
              <div className={styles.sectionLabel}>Map columns</div>
              <div className={styles.mapGrid}>
                {insertableColumns.map((column) => (
                  <label key={column.name} className={styles.mapRow}>
                    <span className={styles.targetCol}>
                      {column.name}
                      <span className={styles.targetType}>{column.dataType}</span>
                    </span>
                    <select
                      value={mapping[column.name] ?? SKIP}
                      onChange={(event) =>
                        setMapping((current) => ({ ...current, [column.name]: event.target.value }))
                      }
                    >
                      <option value={SKIP}>— skip —</option>
                      {parsed.sourceColumns.map((source) => (
                        <option key={source} value={source}>
                          {source}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              {mappedColumns.length > 0 ? (
                <>
                  <div className={styles.sectionLabel}>Preview (first {PREVIEW_LIMIT})</div>
                  <div className={styles.previewWrap}>
                    <table className={styles.previewTable}>
                      <thead>
                        <tr>
                          {mappedColumns.map((column) => (
                            <th key={column.name}>{column.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.records.slice(0, PREVIEW_LIMIT).map((record, rowIndex) => (
                          <tr key={rowIndex}>
                            {mappedColumns.map((column) => {
                              const value = coerceValue(record[mapping[column.name]], column.dataType)
                              return (
                                <td key={column.name}>
                                  {value === null ? (
                                    <span className={styles.nullCell}>NULL</span>
                                  ) : typeof value === 'object' ? (
                                    JSON.stringify(value)
                                  ) : (
                                    String(value)
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {error ? <div className={styles.alert}>{error}</div> : null}
          {result ? <div className={styles.success}>{result}</div> : null}

          <div className="history-actions">
            <button
              className="btn small primary"
              onClick={() => void handleImport()}
              disabled={importing || mappedColumns.length === 0 || parsed.records.length === 0}
            >
              {importing
                ? 'Importing…'
                : `Import ${parsed.records.length} rows → ${mappedColumns.length} columns`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
