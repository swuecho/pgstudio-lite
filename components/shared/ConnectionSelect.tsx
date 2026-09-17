import type { ConnectionItem } from '@/features/connections/connections.service'
import { useConnectionColorStyle } from './hooks/useConnectionColor'
import styles from './ConnectionColor.module.css'

type ConnectionSelectProps = {
  value: string
  connections: ConnectionItem[]
  onChange: (connectionName: string) => void
  ariaLabel?: string
}

/**
 * The connection picker, tinted with the connection's own color so the
 * environment you are pointed at is visible without reading the name.
 */
export function ConnectionSelect({
  value,
  connections,
  onChange,
  ariaLabel = 'Connection',
}: ConnectionSelectProps) {
  const color = useConnectionColorStyle(value)
  const isMissing = Boolean(value) && !connections.some((connection) => connection.name === value)
  const colored = color.colorId !== 'none'

  return (
    <div
      className={`${styles.connectionSelect} ${colored ? styles.connectionSelectColored : ''}`.trim()}
      style={color.vars}
    >
      {colored ? <span className={styles.dot} aria-hidden="true" /> : null}
      <select
        className={styles.select}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {isMissing ? <option value={value}>{value} (unavailable)</option> : null}
        {connections.map((connection) => (
          <option key={connection.name} value={connection.name}>
            {connection.name}
            {connection.readOnly ? ' (read-only)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
