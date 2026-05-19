import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

export function useToolbarPopoverPosition(
  isOpen: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  width = 320
) {
  const [style, setStyle] = useState<CSSProperties>({})

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) {
      setStyle({})
      return
    }

    const update = () => {
      const rect = anchorRef.current!.getBoundingClientRect()
      const resolvedWidth = Math.min(width, window.innerWidth - 16)
      const left = Math.max(8, Math.min(rect.right - resolvedWidth, window.innerWidth - resolvedWidth - 8))

      setStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left,
        width: resolvedWidth,
        zIndex: 1000,
      })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [isOpen, anchorRef, width])

  return style
}

export function isOutsideToolbarPopover(target: Node, refs: Array<HTMLElement | null>) {
  return refs.every((ref) => !ref?.contains(target))
}
