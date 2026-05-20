import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'

const DEFAULT_INITIAL_HEIGHT = 280
const DEFAULT_MIN_HEIGHT = 120
const DEFAULT_MIN_SIBLING_HEIGHT = 160
const RESIZE_BODY_CLASS = 'resizing-cell-panel'

type UseBottomPanelResizerOptions = {
  initialHeight?: number
  minHeight?: number
  minSiblingHeight?: number
  panelRef?: RefObject<HTMLElement | null>
}

export function useBottomPanelResizer(options: UseBottomPanelResizerOptions = {}) {
  const {
    initialHeight = DEFAULT_INITIAL_HEIGHT,
    minHeight = DEFAULT_MIN_HEIGHT,
    minSiblingHeight = DEFAULT_MIN_SIBLING_HEIGHT,
    panelRef: externalPanelRef,
  } = options

  const internalPanelRef = useRef<HTMLElement | null>(null)
  const panelRef = externalPanelRef ?? internalPanelRef
  const [height, setHeight] = useState(initialHeight)
  const [isResizing, setIsResizing] = useState(false)

  const getMaxHeight = useCallback(() => {
    const parent = panelRef.current?.parentElement
    if (!parent) return Math.max(minHeight, initialHeight * 2)
    return Math.max(minHeight, parent.clientHeight - minSiblingHeight)
  }, [initialHeight, minHeight, minSiblingHeight, panelRef])

  const startResize = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      const startY = event.clientY
      const startHeight = height
      setIsResizing(true)
      document.body.classList.add(RESIZE_BODY_CLASS)

      const onMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY
        const maxHeight = getMaxHeight()
        setHeight(Math.min(maxHeight, Math.max(minHeight, startHeight - deltaY)))
      }

      const onMouseUp = () => {
        setIsResizing(false)
        document.body.classList.remove(RESIZE_BODY_CLASS)
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [getMaxHeight, height, minHeight]
  )

  return {
    height,
    isResizing,
    panelRef,
    startResize,
  }
}
