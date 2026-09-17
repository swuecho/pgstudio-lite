import { connectionColorTones, getConnectionColor } from '@/lib/connection-color'
import { useThemeMode } from '@/hooks/useThemeMode'
import styles from './ConnectionColor.module.css'

/** The colored dot that marks a connection wherever its name is shown. */
export function ConnectionColorDot({ color }: { color: string | null | undefined }) {
  const theme = useThemeMode()
  if (getConnectionColor(color).id === 'none') return null
  const tones = connectionColorTones(color, theme)
  return (
    <span
      className={styles.dot}
      style={{ '--conn-accent': tones.accent } as React.CSSProperties}
      aria-hidden="true"
    />
  )
}
