import type { TableFilterMode } from '../../lib/table-filter'
import {
  tableEditorFilterKey,
  useTableEditorFilterStore,
  type TableEditorFilter,
} from './stores/tableEditorFilterStore'
import { useTableEditorLocalStore } from './stores/tableEditorLocalStore'

type FilterSetters = {
  setFilterColumn: (value: string) => void
  setFilterMode: (value: TableFilterMode) => void
  setFilterValue: (value: string) => void
  setFilterValueEnd: (value: string) => void
}

function applyFilter(filter: TableEditorFilter, setters: FilterSetters) {
  setters.setFilterColumn(filter.filterColumn)
  setters.setFilterMode(filter.filterMode)
  setters.setFilterValue(filter.filterValue)
  setters.setFilterValueEnd(filter.filterValueEnd)
}

function clearFilter(setters: FilterSetters) {
  setters.setFilterColumn('')
  setters.setFilterValue('')
  setters.setFilterValueEnd('')
  setters.setFilterMode('contains')
}

export function restoreTableFilters(
  connectionName: string,
  activeTable: string,
  setters: FilterSetters
) {
  const local = useTableEditorLocalStore.getState()
  if (local.skipFilterRestore) {
    useTableEditorLocalStore.setState({ skipFilterRestore: false })
    return
  }

  const saved =
    useTableEditorFilterStore.getState().filtersByKey[tableEditorFilterKey(connectionName, activeTable)]
  if (saved) {
    applyFilter(saved, setters)
    return
  }

  clearFilter(setters)
}
