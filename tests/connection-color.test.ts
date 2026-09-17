import { describe, expect, it } from 'vitest'
import {
  CONNECTION_COLOR_IDS,
  connectionColorTones,
  getConnectionColor,
  isConnectionColorId,
} from '../lib/connection-color'
import { editorThemeName } from '../components/sql-editor/editorThemes'

describe('connection colors', () => {
  it('validates palette ids', () => {
    expect(isConnectionColorId('red')).toBe(true)
    expect(isConnectionColorId('chartreuse')).toBe(false)
    expect(isConnectionColorId(null)).toBe(false)
    expect(CONNECTION_COLOR_IDS).toContain('none')
  })

  it('falls back to no color for unknown or missing ids', () => {
    expect(getConnectionColor(null).id).toBe('none')
    expect(getConnectionColor('nope').id).toBe('none')
    expect(getConnectionColor('blue').id).toBe('blue')
  })

  it('resolves different tones per theme', () => {
    const light = connectionColorTones('red', 'light')
    const dark = connectionColorTones('red', 'dark')
    expect(light.tint).not.toBe(dark.tint)
    expect(light.accent).not.toBe(dark.accent)
  })

  it('names one editor theme per color and app theme', () => {
    expect(editorThemeName('light')).toBe('supabase-light')
    expect(editorThemeName('dark', 'none')).toBe('supabase-dark')
    expect(editorThemeName('light', 'red')).toBe('supabase-light-red')
    expect(editorThemeName('dark', 'red')).toBe('supabase-dark-red')
    // An unknown id must not produce a theme Monaco never defined.
    expect(editorThemeName('light', 'chartreuse')).toBe('supabase-light')
  })
})
