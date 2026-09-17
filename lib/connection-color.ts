/**
 * Connection colors are stored as ids, not hex, so the same connection reads
 * correctly in both app themes: each id carries an accent (name text, dots,
 * borders) and a tint (editor backgrounds) per theme.
 */
export type ConnectionColorId =
  | 'none'
  | 'red'
  | 'orange'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'gray'

export type ConnectionColorTones = { accent: string; tint: string }

export type ConnectionColor = {
  id: ConnectionColorId
  label: string
  light: ConnectionColorTones
  dark: ConnectionColorTones
}

/** `none` keeps the untinted editor background, matching pre-color behaviour. */
export const CONNECTION_COLORS: ConnectionColor[] = [
  {
    id: 'none',
    label: 'No color',
    light: { accent: '#101827', tint: '#fcfdff' },
    dark: { accent: '#e5e7eb', tint: '#111827' },
  },
  {
    id: 'red',
    label: 'Red',
    light: { accent: '#c0344a', tint: '#fff5f6' },
    dark: { accent: '#ff9aa8', tint: '#1f1417' },
  },
  {
    id: 'orange',
    label: 'Orange',
    light: { accent: '#a85b12', tint: '#fff8ef' },
    dark: { accent: '#f0a868', tint: '#1e1812' },
  },
  {
    id: 'green',
    label: 'Green',
    light: { accent: '#1d7a4d', tint: '#f2fcf6' },
    dark: { accent: '#6ce5a9', tint: '#111d17' },
  },
  {
    id: 'teal',
    label: 'Teal',
    light: { accent: '#0f766e', tint: '#f0fbfa' },
    dark: { accent: '#5fd3c4', tint: '#101d1c' },
  },
  {
    id: 'blue',
    label: 'Blue',
    light: { accent: '#1864d6', tint: '#f4f8ff' },
    dark: { accent: '#7fb2ff', tint: '#111a26' },
  },
  {
    id: 'purple',
    label: 'Purple',
    light: { accent: '#7c3aed', tint: '#f9f5ff' },
    dark: { accent: '#c4a3f5', tint: '#181427' },
  },
  {
    id: 'pink',
    label: 'Pink',
    light: { accent: '#be3f7e', tint: '#fff5fa' },
    dark: { accent: '#f3a0c8', tint: '#22131c' },
  },
  {
    id: 'gray',
    label: 'Gray',
    light: { accent: '#4f617a', tint: '#f6f8fb' },
    dark: { accent: '#b1bfd6', tint: '#151b24' },
  },
]

export const CONNECTION_COLOR_IDS = CONNECTION_COLORS.map((color) => color.id) as [
  ConnectionColorId,
  ...ConnectionColorId[],
]

const BY_ID = new Map(CONNECTION_COLORS.map((color) => [color.id, color]))

export const DEFAULT_CONNECTION_COLOR = CONNECTION_COLORS[0]

export function isConnectionColorId(value: unknown): value is ConnectionColorId {
  return typeof value === 'string' && BY_ID.has(value as ConnectionColorId)
}

/** Unknown or missing ids fall back to `none` rather than throwing. */
export function getConnectionColor(id: string | null | undefined): ConnectionColor {
  if (!id) return DEFAULT_CONNECTION_COLOR
  return BY_ID.get(id as ConnectionColorId) || DEFAULT_CONNECTION_COLOR
}

export function connectionColorTones(
  id: string | null | undefined,
  theme: 'light' | 'dark'
): ConnectionColorTones {
  const color = getConnectionColor(id)
  return theme === 'dark' ? color.dark : color.light
}
