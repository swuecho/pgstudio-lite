// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useGridKeyboardNav } from '@/hooks/useGridKeyboardNav'

function Grid({ rowCount, colCount }: { rowCount: number; colCount: number }) {
  const { containerRef, cellProps, onKeyDown } = useGridKeyboardNav({ rowCount, colCount })

  return (
    <div ref={containerRef} onKeyDown={onKeyDown}>
      <table>
        <tbody>
          {Array.from({ length: rowCount }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: colCount }, (_, col) => {
                const props = cellProps(row, col)
                return (
                  <td key={col}>
                    <span
                      role="button"
                      data-grid-cell={props['data-grid-cell']}
                      tabIndex={props.tabIndex}
                      onFocus={props.onCellFocus}
                    >
                      {`r${row}c${col}`}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const cell = (row: number, col: number) => screen.getByText(`r${row}c${col}`)

describe('useGridKeyboardNav', () => {
  it('puts exactly one cell in the tab sequence', () => {
    render(<Grid rowCount={5} colCount={4} />)

    const tabbable = screen.getAllByRole('button').filter((node) => node.tabIndex === 0)
    expect(tabbable).toHaveLength(1)
    expect(tabbable[0]).toHaveTextContent('r0c0')
  })

  it('reaches the grid in one Tab regardless of size', async () => {
    const user = userEvent.setup()
    render(<Grid rowCount={50} colCount={13} />)

    await user.tab()
    expect(cell(0, 0)).toHaveFocus()
  })

  it('moves focus with the arrow keys', async () => {
    const user = userEvent.setup()
    render(<Grid rowCount={3} colCount={3} />)

    await act(async () => {
      cell(0, 0).focus()
    })
    await user.keyboard('{ArrowRight}')
    expect(cell(0, 1)).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(cell(1, 1)).toHaveFocus()

    await user.keyboard('{ArrowLeft}{ArrowUp}')
    expect(cell(0, 0)).toHaveFocus()
  })

  it('stops at the edges instead of wrapping', async () => {
    const user = userEvent.setup()
    render(<Grid rowCount={2} colCount={2} />)

    await act(async () => {
      cell(0, 0).focus()
    })
    await user.keyboard('{ArrowUp}{ArrowLeft}')
    expect(cell(0, 0)).toHaveFocus()
  })

  it('jumps to row edges with Home and End', async () => {
    const user = userEvent.setup()
    render(<Grid rowCount={3} colCount={4} />)

    await act(async () => {
      cell(1, 1).focus()
    })
    await user.keyboard('{End}')
    expect(cell(1, 3)).toHaveFocus()

    await user.keyboard('{Home}')
    expect(cell(1, 0)).toHaveFocus()
  })

  it('ignores keys pressed outside a grid cell', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <button type="button">Outside</button>
        <Grid rowCount={3} colCount={3} />
      </div>
    )

    const outside = screen.getByRole('button', { name: 'Outside' })
    await act(async () => {
      outside.focus()
    })
    await user.keyboard('{ArrowDown}')
    expect(outside).toHaveFocus()
  })
})
