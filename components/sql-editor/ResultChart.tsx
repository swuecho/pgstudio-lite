import { useEffect, useMemo, useRef, useState } from 'react'
import type { EChartsType } from 'echarts'
import styles from './ResultChart.module.css'
import { useThemeMode } from '@/hooks/useThemeMode'
import type { ResultChartType } from '@/lib/notebook-chart-config'

export type ResultChartConfig = {
  chartType: ResultChartType
  xField: string
  yFields: string[]
}

type ResultChartProps = {
  fields: string[]
  rows: Record<string, unknown>[]
  initialConfig?: Partial<ResultChartConfig>
  onConfigChange?: (config: ResultChartConfig) => void
}

type ChartType = ResultChartType

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'pie', label: 'Pie' },
]

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function formatCategory(value: unknown): string {
  if (value == null) return '∅'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function isNumericField(field: string, rows: Record<string, unknown>[]): boolean {
  let seen = 0
  for (const row of rows) {
    const value = row[field]
    if (value == null) continue
    seen += 1
    if (toNumber(value) == null) return false
    if (seen >= 25) break
  }
  return seen > 0
}

function buildOption(
  chartType: ChartType,
  xField: string,
  yFields: string[],
  rows: Record<string, unknown>[]
) {
  if (chartType === 'pie') {
    const yField = yFields[0]
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      legend: { type: 'scroll', bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['35%', '65%'],
          data: rows.map((row) => ({
            name: formatCategory(row[xField]),
            value: toNumber(row[yField]) ?? 0,
          })),
        },
      ],
    }
  }

  const categories = rows.map((row) => formatCategory(row[xField]))
  const series = yFields.map((field) => ({
    name: field,
    type: chartType === 'area' ? 'line' : chartType,
    areaStyle: chartType === 'area' ? {} : undefined,
    showSymbol: chartType !== 'line' && chartType !== 'area',
    data: rows.map((row) => toNumber(row[field])),
  }))

  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: chartType === 'scatter' ? 'item' : 'axis' },
    legend: yFields.length > 1 ? { type: 'scroll', top: 0 } : undefined,
    grid: { left: 8, right: 16, top: yFields.length > 1 ? 32 : 12, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { rotate: categories.length > 8 ? 35 : 0, hideOverlap: true },
    },
    yAxis: { type: 'value' },
    series,
  }
}

export function ResultChart({ fields, rows, initialConfig, onConfigChange }: ResultChartProps) {
  const theme = useThemeMode()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<EChartsType | null>(null)
  const [ready, setReady] = useState(0)

  const numericFields = useMemo(() => fields.filter((field) => isNumericField(field, rows)), [fields, rows])

  const [chartType, setChartType] = useState<ChartType>(() => initialConfig?.chartType ?? 'bar')
  const [xField, setXField] = useState(() =>
    initialConfig?.xField && fields.includes(initialConfig.xField)
      ? initialConfig.xField
      : (fields.find((field) => !numericFields.includes(field)) ?? fields[0] ?? '')
  )
  const [yFields, setYFields] = useState<string[]>(() => {
    const stored = (initialConfig?.yFields ?? []).filter((field) => numericFields.includes(field))
    if (stored.length > 0) return stored
    return numericFields.length > 0 ? [numericFields[0]] : []
  })

  // Report config changes upward (e.g. for persistence) without forcing the
  // callback's identity into the dependency list.
  const onConfigChangeRef = useRef(onConfigChange)
  useEffect(() => {
    onConfigChangeRef.current = onConfigChange
  })
  useEffect(() => {
    onConfigChangeRef.current?.({ chartType, xField, yFields })
  }, [chartType, xField, yFields])

  // Re-init the chart instance when the theme changes (echarts theme is baked
  // in at init time), and tear it down on unmount.
  useEffect(() => {
    let disposed = false
    let observer: ResizeObserver | null = null

    void import('echarts').then((echarts) => {
      if (disposed || !containerRef.current) return
      chartRef.current = echarts.init(containerRef.current, theme === 'dark' ? 'dark' : undefined)
      observer = new ResizeObserver(() => chartRef.current?.resize())
      observer.observe(containerRef.current)
      setReady((value) => value + 1)
    })

    return () => {
      disposed = true
      observer?.disconnect()
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [theme])

  const effectiveY = chartType === 'pie' ? yFields.slice(0, 1) : yFields

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !xField || effectiveY.length === 0) return
    chart.setOption(buildOption(chartType, xField, effectiveY, rows), true)
  }, [ready, chartType, xField, effectiveY, rows])

  if (numericFields.length === 0) {
    return <div className={styles.empty}>No numeric columns available to chart.</div>
  }

  const toggleYField = (field: string) => {
    setYFields((current) =>
      current.includes(field) ? current.filter((item) => item !== field) : [...current, field]
    )
  }

  return (
    <div className={styles.chartWrap}>
      <div className={styles.controls}>
        <label className={styles.control}>
          <span>Type</span>
          <select value={chartType} onChange={(event) => setChartType(event.target.value as ChartType)}>
            {CHART_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.control}>
          <span>{chartType === 'pie' ? 'Label' : 'X axis'}</span>
          <select value={xField} onChange={(event) => setXField(event.target.value)}>
            {fields.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.control}>
          <span>{chartType === 'pie' ? 'Value' : 'Y axis'}</span>
          <div className={styles.yFields}>
            {numericFields.map((field) => {
              const active = effectiveY.includes(field)
              return (
                <button
                  key={field}
                  type="button"
                  className={`${styles.yChip} ${active ? styles.yChipActive : ''}`.trim()}
                  onClick={() => (chartType === 'pie' ? setYFields([field]) : toggleYField(field))}
                >
                  {field}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div ref={containerRef} className={styles.canvas} />
      {effectiveY.length === 0 ? (
        <div className={styles.overlayHint}>Select a numeric column to plot.</div>
      ) : null}
    </div>
  )
}
