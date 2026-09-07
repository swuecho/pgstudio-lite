import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTableDdl } from '@/features/table/table.service'
import styles from './TableDdlModal.module.css'
import { copyTextToClipboard } from '@/lib/clipboard'

type TableDdlModalProps = {
  connectionName: string
  schema: string
  table: string
  onClose: () => void
}

export function TableDdlModal({ connectionName, schema, table, onClose }: TableDdlModalProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const qualifiedName = schema === 'public' ? table : `${schema}.${table}`

  const ddlQuery = useQuery({
    queryKey: ['table', 'ddl', connectionName, schema, table],
    queryFn: () => getTableDdl({ connectionName, schema, table }),
    enabled: Boolean(connectionName && table),
  })

  const ddl = ddlQuery.data?.ddl || ''

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = useCallback(() => {
    if (!ddl) return
    void copyTextToClipboard(ddl).then((ok) => {
      if (!ok) return
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 900)
    })
  }, [ddl])

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="table-ddl-title">
      <div className={`modal-card ${styles.ddlModal}`}>
        <div className="modal-head">
          <div className="nav-title" id="table-ddl-title">
            DDL: {qualifiedName}
          </div>
          <div className={styles.ddlModalActions}>
            <button type="button" className="btn small" onClick={handleCopy} disabled={!ddl}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" className="btn small" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="modal-body">
          {ddlQuery.isLoading ? <div className={styles.ddlStatus}>Loading DDL...</div> : null}
          {ddlQuery.isError ? (
            <div className={styles.ddlError}>
              {ddlQuery.error instanceof Error ? ddlQuery.error.message : 'Failed to load DDL'}
            </div>
          ) : null}
          {ddl ? <pre className={styles.ddlPre}>{ddl}</pre> : null}
        </div>
      </div>
    </div>
  )
}
