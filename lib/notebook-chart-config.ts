export type ResultChartView = 'table' | 'chart'
export type ResultChartType = 'bar' | 'line' | 'area' | 'scatter' | 'pie'

export type StoredChartConfig = {
  view: ResultChartView
  chartType?: ResultChartType
  xField?: string
  yFields?: string[]
}

const STORAGE_KEY = 'pgstudio-notebook-charts'

function readAll(): Record<string, StoredChartConfig> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, StoredChartConfig>) : {}
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, StoredChartConfig>) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / availability errors
  }
}

function entryKey(notebookId: string, cellId: string, statementIndex: number): string {
  return `${notebookId}:${cellId}:${statementIndex}`
}

export function getChartConfig(
  notebookId: string,
  cellId: string,
  statementIndex: number
): StoredChartConfig | null {
  return readAll()[entryKey(notebookId, cellId, statementIndex)] ?? null
}

export function setChartConfig(
  notebookId: string,
  cellId: string,
  statementIndex: number,
  config: StoredChartConfig
): void {
  const map = readAll()
  map[entryKey(notebookId, cellId, statementIndex)] = config
  writeAll(map)
}
