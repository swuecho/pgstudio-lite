import type * as Monaco from 'monaco-editor'

export const SQL_EDITOR_LIGHT_THEME = 'supabase-light'
export const SQL_EDITOR_DARK_THEME = 'supabase-dark'

export function sqlEditorThemeName(theme: 'light' | 'dark') {
  return theme === 'dark' ? SQL_EDITOR_DARK_THEME : SQL_EDITOR_LIGHT_THEME
}

export function defineSqlEditorThemes(monaco: typeof Monaco) {
  monaco.editor.defineTheme(SQL_EDITOR_LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: '', background: 'fcfdff' },
      { token: '', background: 'fcfdff', foreground: '101827' },
      { token: 'string.sql', foreground: '1e9f6e' },
      { token: 'comment', foreground: '7d8aa2' },
      { token: 'predefined.sql', foreground: '1f2a3a' },
    ],
    colors: {
      'editor.background': '#fcfdff',
      'editorLineNumber.foreground': '#9ba9bf',
      'editorLineNumber.activeForeground': '#55657f',
    },
  })
  monaco.editor.defineTheme(SQL_EDITOR_DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', background: '111827', foreground: 'e5e7eb' },
      { token: 'string.sql', foreground: '34d399' },
      { token: 'comment', foreground: '7c8799' },
      { token: 'predefined.sql', foreground: 'e5e7eb' },
    ],
    colors: {
      'editor.background': '#111827',
      'editorLineNumber.foreground': '#667085',
      'editorLineNumber.activeForeground': '#d0d5dd',
    },
  })
}
