import { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
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
  const router = useRouter()
  const didInitRef = useRef(false)
  const skipPushRef = useRef(false)

  useEffect(() => {
    if (!router.isReady) return

    const url = parseTableEditorUrlQuery(router.query)
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
    router.isReady,
    router.query.connectionName,
    router.query.schema,
    router.query.table,
    router.query.filterColumn,
    router.query.filterValue,
    router.query.filterValueEnd,
    router.query.filterMode,
    state.applyTableNavigation,
    state.setConnectionName,
    state.setActiveTable,
  ])

  useEffect(() => {
    if (!router.isReady || !didInitRef.current) return
    if (skipPushRef.current) {
      skipPushRef.current = false
      return
    }
    if (tableEditorUrlMatches(router.query, state)) return

    void router.replace(
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
      undefined,
      { shallow: true }
    )
    // Granular deps mirror URL fields + filter state; listing `router`/`state` risks replace feedback loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    router.isReady,
    router.query.connectionName,
    router.query.schema,
    router.query.table,
    router.query.filterColumn,
    router.query.filterValue,
    router.query.filterValueEnd,
    router.query.filterMode,
    state.activeTable,
    state.connectionName,
    state.filterColumn,
    state.filterMode,
    state.filterValue,
    state.filterValueEnd,
  ])
}
