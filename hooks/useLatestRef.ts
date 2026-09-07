import { useEffect, useRef, type RefObject } from 'react'

/**
 * A ref that always holds the latest render's `value`, updated after commit.
 *
 * Lets memoized children receive handlers created once (`useMemo(..., [])`)
 * that still call into the newest state and callbacks when invoked.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}
