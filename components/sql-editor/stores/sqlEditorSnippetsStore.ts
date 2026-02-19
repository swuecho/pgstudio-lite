import { create } from 'zustand'
import type { SnippetItem } from '../types'

type SqlEditorSnippetsStore = {
  snippetItems: SnippetItem[]
  savingSnippet: boolean
  renamingSnippetId: string | null
  renameDraft: string
  setSnippetItems: (updater: SnippetItem[] | ((prev: SnippetItem[]) => SnippetItem[])) => void
  setSavingSnippet: (saving: boolean) => void
  setRenamingSnippetId: (id: string | null) => void
  setRenameDraft: (value: string) => void
}

export const useSqlEditorSnippetsStore = create<SqlEditorSnippetsStore>((set) => ({
  snippetItems: [],
  savingSnippet: false,
  renamingSnippetId: null,
  renameDraft: '',
  setSnippetItems: (updater) =>
    set((state) => ({
      snippetItems: typeof updater === 'function' ? updater(state.snippetItems) : updater,
    })),
  setSavingSnippet: (saving) => set({ savingSnippet: saving }),
  setRenamingSnippetId: (id) => set({ renamingSnippetId: id }),
  setRenameDraft: (value) => set({ renameDraft: value }),
}))
