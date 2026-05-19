export function sanitizeRowsQueryOptions(
  columnNames: string[],
  options: { sortBy?: string; filterColumn?: string; filterValue?: string }
) {
  const names = new Set(columnNames)
  const sortBy = options.sortBy && names.has(options.sortBy) ? options.sortBy : ''
  const filterColumn = options.filterColumn && names.has(options.filterColumn) ? options.filterColumn : ''
  const filterValue = filterColumn ? (options.filterValue || '').trim() : ''
  return { sortBy, filterColumn, filterValue }
}
