import styles from './ActivityPage.module.css'

type StatementsNotInstalledProps = {
  readOnly: boolean
  installing: boolean
  installError: string | null
  onInstall: () => void
}

export function StatementsNotInstalled({
  readOnly,
  installing,
  installError,
  onInstall,
}: StatementsNotInstalledProps) {
  return (
    <div className={styles.empty}>
      <p>
        The <code>pg_stat_statements</code> extension is not installed on this database.
      </p>
      <p style={{ marginTop: 8 }}>
        Run <code>CREATE EXTENSION pg_stat_statements;</code> (and add{' '}
        <code>shared_preload_libraries = &apos;pg_stat_statements&apos;</code> to <code>postgresql.conf</code>
        , then restart) to enable per-query timing stats.
      </p>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 8 }}>
        <button
          className="btn small primary"
          disabled={readOnly || installing}
          title={readOnly ? 'Connection is read-only' : 'CREATE EXTENSION pg_stat_statements'}
          onClick={onInstall}
        >
          {installing ? 'Installing...' : 'Install extension'}
        </button>
      </div>
      {installError ? <p style={{ marginTop: 12, color: 'var(--danger, #e54d4d)' }}>{installError}</p> : null}
    </div>
  )
}
