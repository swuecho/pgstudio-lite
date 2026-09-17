import { CONNECTION_COLORS, type ConnectionColorId } from '@/lib/connection-color'
import { useThemeMode } from '@/hooks/useThemeMode'
import styles from './ConnectionColor.module.css'

type ConnectionColorPickerProps = {
  value: ConnectionColorId | null
  onChange: (value: ConnectionColorId | null) => void
  disabled?: boolean
}

/** Swatch row for picking a connection's color; `none` clears it. */
export function ConnectionColorPicker({ value, onChange, disabled }: ConnectionColorPickerProps) {
  const theme = useThemeMode()
  const selected = value ?? 'none'

  return (
    <div className={styles.picker} role="radiogroup" aria-label="Connection color">
      {CONNECTION_COLORS.map((color) => {
        const tones = theme === 'dark' ? color.dark : color.light
        const isSelected = selected === color.id
        return (
          <button
            key={color.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={color.label}
            title={color.label}
            disabled={disabled}
            className={`${styles.swatchButton} ${isSelected ? styles.swatchButtonSelected : ''}`.trim()}
            onClick={() => onChange(color.id === 'none' ? null : color.id)}
          >
            <span
              className={`${styles.swatch} ${color.id === 'none' ? styles.swatchNone : ''}`.trim()}
              style={{ background: tones.tint, borderColor: tones.accent }}
            />
          </button>
        )
      })}
    </div>
  )
}
