import { describe, expect, it } from 'vitest'
import {
  addEntryAtPath,
  containerKind,
  nextAvailableKey,
  parseScalarInput,
  removeAtPath,
  renameKeyAtPath,
  scalarText,
  setAtPath,
  summarizeContainer,
} from '../lib/json-tree'

describe('json-tree', () => {
  it('describes containers and scalars', () => {
    expect(containerKind([])).toBe('array')
    expect(containerKind({})).toBe('object')
    expect(containerKind(null)).toBeNull()
    expect(summarizeContainer({ a: 1 }, 'object')).toBe('1 key')
    expect(summarizeContainer([1, 2], 'array')).toBe('2 items')
    expect(scalarText('hi')).toBe('"hi"')
    expect(scalarText(null)).toBe('null')
    expect(scalarText(3)).toBe('3')
  })

  it('reads scalar input as JSON when it parses, as text otherwise', () => {
    expect(parseScalarInput('12')).toBe(12)
    expect(parseScalarInput('true')).toBe(true)
    expect(parseScalarInput('null')).toBeNull()
    expect(parseScalarInput('"quoted"')).toBe('quoted')
    expect(parseScalarInput('{}')).toEqual({})
    expect(parseScalarInput('plain text')).toBe('plain text')
    expect(parseScalarInput('')).toBe('')
  })

  it('edits nested values without mutating the original', () => {
    const original = { a: { b: [1, 2] }, c: true }
    const next = setAtPath(original, ['a', 'b', '1'], 9)

    expect(next).toEqual({ a: { b: [1, 9] }, c: true })
    expect(original).toEqual({ a: { b: [1, 2] }, c: true })
  })

  it('removes object keys and array items', () => {
    expect(removeAtPath({ a: 1, b: 2 }, [], 'b')).toEqual({ a: 1 })
    expect(removeAtPath({ list: [1, 2, 3] }, ['list'], '1')).toEqual({ list: [1, 3] })
  })

  it('renames keys in place and drops a colliding key', () => {
    expect(Object.keys(renameKeyAtPath({ a: 1, b: 2, c: 3 }, [], 'b', 'z') as object)).toEqual([
      'a',
      'z',
      'c',
    ])
    expect(renameKeyAtPath({ a: 1, b: 2 }, [], 'b', 'a')).toEqual({ a: 2 })
  })

  it('appends entries with a free key', () => {
    expect(nextAvailableKey({ key: 1, key2: 2 })).toBe('key3')
    expect(addEntryAtPath({ a: 1 }, [])).toEqual({ root: { a: 1, key: null }, key: 'key' })
    expect(addEntryAtPath({ list: [1] }, ['list'])).toEqual({ root: { list: [1, null] }, key: '1' })
    expect(addEntryAtPath(5, [])).toBeNull()
  })
})
