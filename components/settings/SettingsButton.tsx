import { useSettingsPanelStore, type SettingsSection } from '../shared/stores/settingsPanelStore'

type Props = {
  section?: SettingsSection
  className?: string
  label?: string
}

export function SettingsButton({ section, className, label = 'Open settings' }: Props) {
  const open = useSettingsPanelStore((s) => s.open)
  return (
    <button
      type="button"
      className={className || 'btn icon-btn'}
      aria-label={label}
      title={label}
      onClick={() => open(section)}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0 1.6a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8Zm-1.1-7.1a.8.8 0 0 0-.78.63l-.34 1.55a7.6 7.6 0 0 0-1.55.9l-1.5-.5a.8.8 0 0 0-.94.36l-1.1 1.9a.8.8 0 0 0 .17 1l1.2 1.05a7.7 7.7 0 0 0 0 1.8l-1.2 1.05a.8.8 0 0 0-.17 1l1.1 1.9a.8.8 0 0 0 .94.36l1.5-.5c.47.36.99.66 1.55.9l.34 1.55a.8.8 0 0 0 .78.63h2.2a.8.8 0 0 0 .78-.63l.34-1.55c.56-.24 1.08-.54 1.55-.9l1.5.5a.8.8 0 0 0 .94-.36l1.1-1.9a.8.8 0 0 0-.17-1l-1.2-1.05a7.7 7.7 0 0 0 0-1.8l1.2-1.05a.8.8 0 0 0 .17-1l-1.1-1.9a.8.8 0 0 0-.94-.36l-1.5.5a7.6 7.6 0 0 0-1.55-.9l-.34-1.55a.8.8 0 0 0-.78-.63h-2.2Z"
          fill="currentColor"
        />
      </svg>
    </button>
  )
}
