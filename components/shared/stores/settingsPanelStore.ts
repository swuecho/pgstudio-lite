import { create } from 'zustand'

export type SettingsSection = 'connections' | 'appearance' | 'data'

/** Sections shown by the app-wide settings entry (nav rail gear, Cmd+, on desktop). */
export type AppSettingsSection = Exclude<SettingsSection, 'connections'>

type SettingsPanelStore = {
  isOpen: boolean
  activeSection: SettingsSection
  /** Last app-wide tab viewed, so reopening app settings returns to it. */
  lastAppSection: AppSettingsSection
  open: (section?: SettingsSection) => void
  /** Opens app-wide settings on the last app tab viewed. */
  openAppSettings: () => void
  close: () => void
  setActiveSection: (section: SettingsSection) => void
}

function withSection(section: SettingsSection, lastAppSection: AppSettingsSection) {
  return {
    activeSection: section,
    lastAppSection: section === 'connections' ? lastAppSection : section,
  }
}

export const useSettingsPanelStore = create<SettingsPanelStore>((set) => ({
  isOpen: false,
  activeSection: 'connections',
  lastAppSection: 'appearance',
  open: (section) =>
    set((state) => ({
      isOpen: true,
      ...withSection(section ?? state.activeSection, state.lastAppSection),
    })),
  openAppSettings: () => set((state) => ({ isOpen: true, activeSection: state.lastAppSection })),
  close: () => set({ isOpen: false }),
  setActiveSection: (section) => set((state) => withSection(section, state.lastAppSection)),
}))
