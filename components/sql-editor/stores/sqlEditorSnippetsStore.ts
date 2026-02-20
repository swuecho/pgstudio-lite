import { create } from 'zustand'
type SqlEditorSnippetsStore = {
  renamingSnippetId: string | null
  renameDraft: string
  setRenamingSnippetId: (id: string | null) => void
  setRenameDraft: (value: string) => void
}

export const useSqlEditorSnippetsStore = create<SqlEditorSnippetsStore>((set) => ({
  renamingSnippetId: null,
  renameDraft: '',
  setRenamingSnippetId: (id) => set({ renamingSnippetId: id }),
  setRenameDraft: (value) => set({ renameDraft: value }),
}))
