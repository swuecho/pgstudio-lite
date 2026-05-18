import ThemeToggle from '../../theme-toggle'

export function AppearanceSection() {
  return (
    <div className="modal-section">
      <div className="history-meta">Theme</div>
      <div className="history-actions">
        <ThemeToggle />
        <span className="modal-check">Toggle between light and dark mode.</span>
      </div>
    </div>
  )
}
