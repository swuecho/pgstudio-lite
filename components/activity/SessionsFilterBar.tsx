import styles from './ActivityPage.module.css'

/** pg_stat_activity.state values. */
const STATE_OPTIONS = [
  'active',
  'idle',
  'idle in transaction',
  'idle in transaction (aborted)',
  'fastpath function call',
  'disabled',
]

export type SessionFilters = {
  user: string
  app: string
  /** A pg_stat_activity state, or 'all'. */
  state: string
  onlyBlocked: boolean
}

export const EMPTY_SESSION_FILTERS: SessionFilters = { user: '', app: '', state: 'all', onlyBlocked: false }

type SessionsFilterBarProps = {
  filters: SessionFilters
  onChange: (next: SessionFilters) => void
}

export function SessionsFilterBar({ filters, onChange }: SessionsFilterBarProps) {
  const update = (patch: Partial<SessionFilters>) => onChange({ ...filters, ...patch })
  return (
    <div className={styles.filterBar}>
      <input
        placeholder="user"
        value={filters.user}
        onChange={(event) => update({ user: event.target.value })}
      />
      <input
        placeholder="application_name"
        value={filters.app}
        onChange={(event) => update({ app: event.target.value })}
      />
      <select value={filters.state} onChange={(event) => update({ state: event.target.value })}>
        <option value="all">any state</option>
        {STATE_OPTIONS.map((state) => (
          <option key={state} value={state}>
            {state}
          </option>
        ))}
      </select>
      <label>
        <input
          type="checkbox"
          checked={filters.onlyBlocked}
          onChange={(event) => update({ onlyBlocked: event.target.checked })}
        />
        only blocked
      </label>
    </div>
  )
}
