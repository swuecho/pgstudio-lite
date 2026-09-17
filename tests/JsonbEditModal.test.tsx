// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { JsonbEditModal } from '../components/table-editor/JsonbEditModal'

vi.mock('../components/table-editor/JsonbCellEditor', () => ({
  JsonbCellEditor: ({ text, onChange }: { text: string; onChange: (next: string) => void }) => (
    <textarea aria-label="Raw JSON" value={text} onChange={(event) => onChange(event.target.value)} />
  ),
}))

describe('JsonbEditModal', () => {
  it('edits a scalar in the tree and saves the whole document', () => {
    const onSave = vi.fn()
    render(
      <JsonbEditModal column="settings" value={{ platform: 'zhihu' }} onSave={onSave} onCancel={vi.fn()} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit value of platform' }))
    const input = screen.getByRole('textbox', { name: 'Edit value of platform' })
    fireEvent.change(input, { target: { value: '"weibo"' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({ platform: 'weibo' })
  })

  it('renames a key, adds an entry, and removes one', () => {
    const onSave = vi.fn()
    render(<JsonbEditModal column="settings" value={{ a: 1, b: 2 }} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Rename key a' }))
    const keyInput = screen.getByRole('textbox', { name: 'Rename key a' })
    fireEvent.change(keyInput, { target: { value: 'alpha' } })
    fireEvent.keyDown(keyInput, { key: 'Enter' })

    fireEvent.click(screen.getByRole('button', { name: 'Remove b' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add entry to root' }))
    const newKeyInput = screen.getByRole('textbox', { name: 'Rename key key' })
    fireEvent.change(newKeyInput, { target: { value: 'gamma' } })
    fireEvent.keyDown(newKeyInput, { key: 'Enter' })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({ alpha: 1, gamma: null })
  })

  it('keeps tree edits when switching to raw and back', () => {
    const onSave = vi.fn()
    render(<JsonbEditModal column="settings" value={{ a: 1 }} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Raw' }))
    const raw = screen.getByRole('textbox', { name: 'Raw JSON' })
    expect(raw).toHaveValue('{\n  "a": 1\n}')

    fireEvent.change(raw, { target: { value: '{"a": 2, "b": [true]}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tree' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({ a: 2, b: [true] })
  })

  it('refuses to leave raw mode or save while the JSON is invalid', () => {
    const onSave = vi.fn()
    render(<JsonbEditModal column="settings" value={{ a: 1 }} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Raw' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Raw JSON' }), { target: { value: '{ nope' } })

    fireEvent.click(screen.getByRole('button', { name: 'Tree' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Raw JSON' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('opens a scalar cell straight in raw mode', () => {
    render(<JsonbEditModal column="settings" value={42} onSave={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'Raw JSON' })).toHaveValue('42')
  })
})
