// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useBottomPanelResizer } from '../hooks/useBottomPanelResizer'

describe('useBottomPanelResizer', () => {
  afterEach(() => {
    document.body.classList.remove('resizing-cell-panel')
  })

  it('increases height when dragging the handle upward', () => {
    const parent = document.createElement('div')
    Object.defineProperty(parent, 'clientHeight', { value: 800 })
    document.body.appendChild(parent)

    const { result } = renderHook(() => useBottomPanelResizer({ initialHeight: 200 }))
    const panel = document.createElement('section')
    parent.appendChild(panel)
    ;(result.current.panelRef as { current: HTMLElement | null }).current = panel

    act(() => {
      result.current.startResize({
        preventDefault: vi.fn(),
        clientY: 400,
      } as unknown as ReactMouseEvent<HTMLDivElement>)
    })

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 360 }))
    })

    expect(result.current.height).toBe(240)

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'))
    })
  })
})
