import { useEffect } from 'react'
import { filterModeNeedsValue, hasActiveTableFilter, type TableFilterMode } from '../../lib/table-filter'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useTableEditorLocalStore } from './stores/tableEditorLocalStore'

const DEFAULT_FILTER_DEBOUNCE_MS = 300

type UseTableEditorFilterQueryParams = {
  filterColumn: string
  filterValue: string
  filterValueEnd: string
  filterMode: TableFilterMode
  filterDebounceMs: number
}

export function useTableEditorFilterQuery(state: UseTableEditorFilterQueryParams) {
  const debouncedFilterValue = useDebouncedValue(state.filterValue, state.filterDebounceMs)
  const debouncedFilterValueEnd = useDebouncedValue(state.filterValueEnd, state.filterDebounceMs)

  useEffect(() => {
    if (state.filterDebounceMs === 0) {
      useTableEditorLocalStore.setState({ filterDebounceMs: DEFAULT_FILTER_DEBOUNCE_MS })
    }
  }, [state.filterDebounceMs])

  const filterNeedsValue = Boolean(state.filterColumn) && filterModeNeedsValue(state.filterMode)
  const filterSettled =
    !filterNeedsValue ||
    (state.filterValue === debouncedFilterValue && state.filterValueEnd === debouncedFilterValueEnd)
  const hasFilter = hasActiveTableFilter(
    state.filterColumn,
    state.filterMode,
    state.filterValue,
    state.filterValueEnd
  )

  return {
    debouncedFilterValue,
    debouncedFilterValueEnd,
    rowsQueryEnabled: filterSettled,
    hideRowsWhileLoading: hasFilter,
  }
}
