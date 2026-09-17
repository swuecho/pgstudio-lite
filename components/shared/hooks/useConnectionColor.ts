import { useMemo } from 'react'
import { useThemeMode } from '@/hooks/useThemeMode'
import {
  connectionColorTones,
  getConnectionColor,
  type ConnectionColorId,
  type ConnectionColorTones,
} from '@/lib/connection-color'
import { useConnections } from './useConnections'

export type ConnectionColorStyle = ConnectionColorTones & {
  colorId: ConnectionColorId
  /** `--conn-accent` / `--conn-tint`, spread onto any element that needs them. */
  vars: Record<string, string>
}

/** CSS variables for a connection's color, resolved for the active theme. */
export function useConnectionColorStyle(connectionName: string | null | undefined): ConnectionColorStyle {
  const { connections } = useConnections()
  const theme = useThemeMode()
  const colorId = connections.find((connection) => connection.name === connectionName)?.color ?? null

  return useMemo(() => {
    const tones = connectionColorTones(colorId, theme)
    return {
      colorId: getConnectionColor(colorId).id,
      ...tones,
      vars: { '--conn-accent': tones.accent, '--conn-tint': tones.tint },
    }
  }, [colorId, theme])
}
