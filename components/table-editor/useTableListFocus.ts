import { useCallback, useEffect, useRef, useState } from 'react'
import { toTableKey } from '@/lib/table-editor-nav'
import type { TableInfo } from './types'
import type { TableListItemKey } from './useTableSidebarSections'

/**
 * Keyboard navigation and active-item tracking for the sidebar table list:
 * arrow / Home / End movement, keeping the active table scrolled into view,
 * and recording it as recently opened.
 */
export function useTableListFocus(input: {
  connectionName: string
  activeTable: string
  flatTables: TableInfo[]
  visibleTableItemKeys: TableListItemKey[]
  onSelectTable: (tableKey: string) => void
  recordRecent: (connectionName: string, tableKey: string) => void
}) {
  const { connectionName, activeTable, flatTables, visibleTableItemKeys, onSelectTable, recordRecent } = input

  const [focusedKey, setFocusedKey] = useState('')
  // Which rendered card is "the" active one when the table appears in several sections.
  const [activeTableItemKey, setActiveTableItemKey] = useState('')
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const lastRecordedTableRef = useRef('')

  const handleSelectTable = useCallback(
    (tableKey: string, itemKey: string) => {
      setActiveTableItemKey(itemKey)
      onSelectTable(tableKey)
      setFocusedKey(tableKey)
    },
    [onSelectTable]
  )

  useEffect(() => {
    lastRecordedTableRef.current = ''
  }, [connectionName])

  useEffect(() => {
    if (!connectionName || !activeTable) return
    if (lastRecordedTableRef.current === activeTable) return
    lastRecordedTableRef.current = activeTable
    recordRecent(connectionName, activeTable)
  }, [activeTable, connectionName, recordRecent])

  const scrollActiveIntoView = useCallback(() => {
    if (!activeTable) return
    const fallbackKey = visibleTableItemKeys.find((item) => item.tableKey === activeTable)?.itemKey
    const node = itemRefs.current[activeTableItemKey] ?? (fallbackKey ? itemRefs.current[fallbackKey] : null)
    node?.scrollIntoView({ block: 'nearest' })
  }, [activeTable, activeTableItemKey, visibleTableItemKeys])

  useEffect(() => {
    scrollActiveIntoView()
  }, [activeTable, flatTables.length, scrollActiveIntoView])

  useEffect(() => {
    if (!activeTable) return
    setFocusedKey(activeTable)
  }, [activeTable])

  useEffect(() => {
    if (!activeTable) {
      setActiveTableItemKey('')
      return
    }

    const activeItemStillVisible = visibleTableItemKeys.some(
      (item) => item.itemKey === activeTableItemKey && item.tableKey === activeTable
    )
    if (activeItemStillVisible) return

    const nextActiveItem = visibleTableItemKeys.find((item) => item.tableKey === activeTable)
    setActiveTableItemKey(nextActiveItem?.itemKey ?? '')
  }, [activeTable, activeTableItemKey, visibleTableItemKeys])

  const focusTable = useCallback(
    (table: TableInfo) => {
      const key = toTableKey(table.schema, table.table)
      const itemKey = visibleTableItemKeys.find((item) => item.tableKey === key)?.itemKey
      setFocusedKey(key)
      return itemRefs.current[itemKey ?? key]
    },
    [visibleTableItemKeys]
  )

  const moveFocus = useCallback(
    (delta: number) => {
      if (flatTables.length === 0) return
      const currentIndex = flatTables.findIndex(
        (table) => toTableKey(table.schema, table.table) === (focusedKey || activeTable)
      )
      const startIndex = currentIndex >= 0 ? currentIndex : 0
      const nextIndex = Math.min(flatTables.length - 1, Math.max(0, startIndex + delta))
      const node = focusTable(flatTables[nextIndex])
      node?.focus()
      node?.scrollIntoView({ block: 'nearest' })
    },
    [activeTable, flatTables, focusedKey, focusTable]
  )

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(-1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      const first = flatTables[0]
      if (first) focusTable(first)?.focus()
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      const last = flatTables[flatTables.length - 1]
      if (last) focusTable(last)?.focus()
    }
  }

  return { focusedKey, setFocusedKey, activeTableItemKey, itemRefs, handleSelectTable, handleListKeyDown }
}
