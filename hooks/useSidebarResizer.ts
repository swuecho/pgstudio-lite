import { useState } from 'react'

const MIN_SIDEBAR_WIDTH = 260
const MAX_SIDEBAR_WIDTH = 600

export function useSidebarResizer(initialWidth = 360) {
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth)

  const handleWidthResizerMouseDown = (event: React.MouseEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + deltaX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return {
    sidebarWidth,
    handleWidthResizerMouseDown,
  }
}
