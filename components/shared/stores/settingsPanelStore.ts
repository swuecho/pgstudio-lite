import { create } from 'zustand'

export type SettingsSection = 'connections' | 'appearance'

type SettingsPanelStore = {
  isOpen: boolean
  activeSection: SettingsSection
  open: (section?: SettingsSection) => void
  close: () => void
  setActiveSection: (section: SettingsSection) => void
}

export const useSettingsPanelStore = create<SettingsPanelStore>((set) => ({
  isOpen: false,
  activeSection: 'connections',
  open: (section) =>
    set((state) => ({
      isOpen: true,
      activeSection: section ?? state.activeSection,
    })),
  close: () => set({ isOpen: false }),
  setActiveSection: (section) => set({ activeSection: section }),
}))
