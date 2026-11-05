import { useEffect, useRef } from 'react'
import { navigateTo, useSearchRecord } from '@/components/shared/navigation'
import {
  parseTableEditorUrlQuery,
  buildTableEditorUrlQuery,
  tableEditorUrlMatches,
} from '@/lib/table-editor-url'
import type { TableFilterMode } from '@/lib/table-filter'
import type { TableEditorFilter } from './stores/tableEditorFilterStore'

type TableEditorUrlSyncState = {
  connectionName: string
  activeTable: string
  filterColumn: string
  filterValue: string
  filterValueEnd: string
  filterMode: TableFilterMode
  setConnectionName: (value: string) => void
  setActiveTable: (value: string) => void
  applyTableNavigation: (args: { activeTable: string; filter?: TableEditorFilter }) => void
}

export function useTableEditorUrlSync(state: TableEditorUrlSyncState) {
  const query = useSearchRecord()
  const didInitRef = useRef(false)
  const skipPushRef = useRef(false)

  useEffect(() => {
    const url = parseTableEditorUrlQuery(query)
    let appliedFromUrl = false

    if (url.connectionName && url.connectionName !== state.connectionName) {
      state.setConnectionName(url.connectionName)
      if (state.activeTable && !url.activeTable) {
        state.setActiveTable('')
        appliedFromUrl = true
      }
    }

    const tableChanging = url.activeTable !== state.activeTable
    if (tableChanging) {
      state.applyTableNavigation({ activeTable: url.activeTable, filter: url.filter })
      appliedFromUrl = true
    } else if (url.filter) {
      state.applyTableNavigation({ activeTable: state.activeTable, filter: url.filter })
      appliedFromUrl = true
    }

    if (appliedFromUrl) skipPushRef.current = true
    didInitRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query.connectionName,
    query.schema,
    query.table,
    query.filterColumn,
    query.filterValue,
    query.filterValueEnd,
    query.filterMode,
    state.applyTableNavigation,
    state.setConnectionName,
    state.setActiveTable,
  ])

  useEffect(() => {
    if (!didInitRef.current) return
    if (skipPushRef.current) {
      skipPushRef.current = false
      return
    }
    if (tableEditorUrlMatches(query, state)) return

    void navigateTo(
      {
        pathname: '/table-editor',
        query: buildTableEditorUrlQuery({
          connectionName: state.connectionName,
          activeTable: state.activeTable,
          filterColumn: state.filterColumn,
          filterMode: state.filterColumn ? state.filterMode : 'contains',
          filterValue: state.filterValue,
          filterValueEnd: state.filterValueEnd,
        }),
      },
      { replace: true }
    )
    // Granular deps mirror URL fields + filter state; listing `query`/`state` risks replace feedback loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query.connectionName,
    query.schema,
    query.table,
    query.filterColumn,
    query.filterValue,
    query.filterValueEnd,
    query.filterMode,
    state.activeTable,
    state.connectionName,
    state.filterColumn,
    state.filterMode,
    state.filterValue,
    state.filterValueEnd,
  ])
}
