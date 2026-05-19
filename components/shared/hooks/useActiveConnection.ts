import { useEffect, useMemo, useRef } from 'react'
import { useActiveConnectionStore } from '../stores/activeConnectionStore'
import { useConnections } from './useConnections'

type UseActiveConnectionOptions = {
  /**
   * Fired when the connections query has loaded and the env reports no
   * connections are configured. Used by the SQL editor to surface a status
   * banner. Stable callback semantics are not required; the hook keeps the
   * latest reference internally.
   */
  onUnconfigured?: () => void
  /**
   * When true (default), an effect ensures the active connection name is
   * always present in the configured connection list; if not, it falls back
   * to the default or the first available connection. Set false when the
   * caller wants the raw store value without auto-correction (e.g. notebook
   * which manages per-notebook connection independently).
   */
  autoResolve?: boolean
}

export function useActiveConnection(options: UseActiveConnectionOptions = {}) {
  const { autoResolve = true } = options
  const onUnconfiguredRef = useRef(options.onUnconfigured)
  useEffect(() => {
    onUnconfiguredRef.current = options.onUnconfigured
  })

  const connectionsQuery = useConnections()
  const { connections, configured, defaultConnectionName, isLoading } = connectionsQuery
  const connectionName = useActiveConnectionStore((s) => s.connectionName)
  const setConnectionName = useActiveConnectionStore((s) => s.setConnectionName)

  const activeConnection = useMemo(
    () => connections.find((c) => c.name === connectionName),
    [connections, connectionName]
  )
  const connectionReadOnly = activeConnection?.readOnly === true

  useEffect(() => {
    if (!autoResolve) return
    if (isLoading) return
    if (!configured) {
      onUnconfiguredRef.current?.()
      return
    }
    if (connections.length === 0) return
    const currentExists = connections.some((c) => c.name === connectionName)
    if (!currentExists) {
      const preferred = defaultConnectionName || connections[0].name
      setConnectionName(preferred)
    }
  }, [autoResolve, connections, configured, defaultConnectionName, isLoading, connectionName, setConnectionName])

  return {
    connections,
    connectionName,
    setConnectionName,
    activeConnection,
    connectionReadOnly,
    isLoading,
    configured,
    defaultConnectionName,
    invalidateConnections: connectionsQuery.invalidateConnections,
  }
}
