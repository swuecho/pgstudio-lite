import type * as Monaco from 'monaco-editor'
import { CONNECTION_COLORS, getConnectionColor } from '@/lib/connection-color'

export const SQL_EDITOR_LIGHT_THEME = 'supabase-light'
export const SQL_EDITOR_DARK_THEME = 'supabase-dark'

/**
 * Monaco themes are global by name, so each connection color gets its own
 * theme per app theme (`supabase-light-red`, ...). The uncolored names stay as
 * they were, and are what an editor with no connection color uses.
 */
export function editorThemeName(theme: 'light' | 'dark', color?: string | null) {
  const base = theme === 'dark' ? SQL_EDITOR_DARK_THEME : SQL_EDITOR_LIGHT_THEME
  const colorId = getConnectionColor(color).id
  return colorId === 'none' ? base : `${base}-${colorId}`
}

/** @deprecated Use {@link editorThemeName}, which also takes a connection color. */
export function sqlEditorThemeName(theme: 'light' | 'dark') {
  return editorThemeName(theme)
}

const LIGHT_RULES: Monaco.editor.ITokenThemeRule[] = [
  { token: '', foreground: '101827' },
  { token: 'string.sql', foreground: '1e9f6e' },
  { token: 'comment', foreground: '7d8aa2' },
  { token: 'predefined.sql', foreground: '1f2a3a' },
]

const DARK_RULES: Monaco.editor.ITokenThemeRule[] = [
  { token: '', foreground: 'e5e7eb' },
  { token: 'string.sql', foreground: '34d399' },
  { token: 'comment', foreground: '7c8799' },
  { token: 'predefined.sql', foreground: 'e5e7eb' },
]

const LIGHT_GUTTER = {
  'editorLineNumber.foreground': '#9ba9bf',
  'editorLineNumber.activeForeground': '#55657f',
}

const DARK_GUTTER = {
  'editorLineNumber.foreground': '#667085',
  'editorLineNumber.activeForeground': '#d0d5dd',
}

/**
 * Defines the light and dark editor themes plus one variant per connection
 * color, whose only difference is the tinted background.
 */
export function defineSqlEditorThemes(monaco: typeof Monaco) {
  for (const color of CONNECTION_COLORS) {
    monaco.editor.defineTheme(editorThemeName('light', color.id), {
      base: 'vs',
      inherit: true,
      rules: LIGHT_RULES,
      colors: { 'editor.background': color.light.tint, ...LIGHT_GUTTER },
    })
    monaco.editor.defineTheme(editorThemeName('dark', color.id), {
      base: 'vs-dark',
      inherit: true,
      rules: DARK_RULES,
      colors: { 'editor.background': color.dark.tint, ...DARK_GUTTER },
    })
  }
}

/** Alias for editors that are not SQL (the jsonb editor uses the same themes). */
export const defineEditorThemes = defineSqlEditorThemes
