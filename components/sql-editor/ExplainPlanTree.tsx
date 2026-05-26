import { useMemo, useState } from 'react'
import styles from './ExplainPlanTree.module.css'

type PlanNode = {
  'Node Type'?: string
  'Parallel Aware'?: boolean
  'Async Capable'?: boolean
  'Join Type'?: string
  'Relation Name'?: string
  'Alias'?: string
  'Index Name'?: string
  'Startup Cost'?: number
  'Total Cost'?: number
  'Plan Rows'?: number
  'Plan Width'?: number
  'Actual Startup Time'?: number
  'Actual Total Time'?: number
  'Actual Rows'?: number
  'Actual Loops'?: number
  'Rows Removed by Filter'?: number
  'Shared Hit Blocks'?: number
  'Shared Read Blocks'?: number
  'Shared Dirtied Blocks'?: number
  'Shared Written Blocks'?: number
  'Filter'?: string
  'Index Cond'?: string
  'Hash Cond'?: string
  'Recheck Cond'?: string
  Plans?: PlanNode[]
  [key: string]: unknown
}

type PlanRoot = {
  Plan: PlanNode
  'Planning Time'?: number
  'Execution Time'?: number
  Triggers?: unknown[]
}

function parsePlan(value: unknown): PlanRoot[] | null {
  let parsed: unknown = value
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }
  if (!Array.isArray(parsed)) return null
  if (parsed.length === 0) return null
  if (!parsed.every((item) => item && typeof item === 'object' && 'Plan' in item)) return null
  return parsed as PlanRoot[]
}

function formatMs(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  if (value < 1) return `${value.toFixed(3)}ms`
  if (value < 1000) return `${value.toFixed(2)}ms`
  return `${(value / 1000).toFixed(2)}s`
}

function formatNumber(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  return value.toLocaleString()
}

function nodeTitle(node: PlanNode): string {
  const parts: string[] = []
  if (node['Parallel Aware']) parts.push('Parallel')
  parts.push(node['Node Type'] || 'Node')
  if (node['Join Type']) parts.push(`(${node['Join Type']})`)
  const target = node['Relation Name']
    ? `on ${node['Relation Name']}${node['Alias'] && node['Alias'] !== node['Relation Name'] ? ` ${node['Alias']}` : ''}`
    : node['Index Name']
      ? `using ${node['Index Name']}`
      : ''
  if (target) parts.push(target)
  return parts.join(' ')
}

function totalExecutionTime(roots: PlanRoot[]): number {
  return roots.reduce((sum, root) => sum + (root['Execution Time'] || 0), 0) || 0
}

function selfTime(node: PlanNode): number {
  const actual = node['Actual Total Time']
  if (actual == null) return 0
  const loops = node['Actual Loops'] || 1
  const total = actual * loops
  const childrenTotal = (node.Plans || []).reduce((sum, child) => {
    const childActual = child['Actual Total Time']
    if (childActual == null) return sum
    const childLoops = child['Actual Loops'] || 1
    return sum + childActual * childLoops
  }, 0)
  return Math.max(0, total - childrenTotal)
}

function rowEstimateRatio(node: PlanNode): number | null {
  const planRows = node['Plan Rows']
  const actualRows = node['Actual Rows']
  if (planRows == null || actualRows == null) return null
  if (planRows === 0 && actualRows === 0) return 1
  if (planRows === 0) return Infinity
  return actualRows / planRows
}

type PlanNodeRowProps = {
  node: PlanNode
  totalTimeMs: number
  depth: number
}

function PlanNodeRow({ node, totalTimeMs, depth }: PlanNodeRowProps) {
  const [open, setOpen] = useState(true)
  const children = node.Plans || []
  const hasChildren = children.length > 0
  const self = selfTime(node)
  const selfPct = totalTimeMs > 0 ? (self / totalTimeMs) * 100 : 0
  const heavy = selfPct >= 50
  const warm = !heavy && selfPct >= 20
  const ratio = rowEstimateRatio(node)
  const badEstimate = ratio != null && Number.isFinite(ratio) && (ratio >= 10 || ratio <= 0.1)

  return (
    <div className={styles.nodeWrap} style={{ marginLeft: depth === 0 ? 0 : 16 }}>
      <div
        className={[
          styles.node,
          heavy ? styles.heavy : '',
          warm ? styles.warm : '',
          badEstimate ? styles.badEstimate : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className={styles.nodeHead}>
          {hasChildren ? (
            <button
              type="button"
              className={styles.toggle}
              onClick={() => setOpen((value) => !value)}
              aria-label={open ? 'Collapse' : 'Expand'}
            >
              {open ? '▾' : '▸'}
            </button>
          ) : (
            <span className={styles.toggleSpacer} />
          )}
          <span className={styles.title}>{nodeTitle(node)}</span>
          {selfPct > 0 ? (
            <span className={styles.selfPct} title="Self time as % of execution time">
              {selfPct.toFixed(1)}%
            </span>
          ) : null}
        </div>
        <div className={styles.metrics}>
          {node['Actual Total Time'] != null ? (
            <Metric
              label="actual"
              value={`${formatMs(node['Actual Total Time'])} × ${node['Actual Loops'] || 1} loop`}
            />
          ) : null}
          {node['Actual Rows'] != null ? (
            <Metric
              label="rows"
              value={`${formatNumber(node['Actual Rows'])} (est ${formatNumber(node['Plan Rows'])})`}
              tone={badEstimate ? 'warn' : undefined}
            />
          ) : node['Plan Rows'] != null ? (
            <Metric label="rows est" value={formatNumber(node['Plan Rows'])} />
          ) : null}
          {node['Total Cost'] != null ? (
            <Metric
              label="cost"
              value={`${(node['Startup Cost'] || 0).toFixed(2)}..${node['Total Cost'].toFixed(2)}`}
            />
          ) : null}
          {node['Shared Hit Blocks'] != null || node['Shared Read Blocks'] != null ? (
            <Metric
              label="blks"
              value={`${formatNumber(node['Shared Hit Blocks'] || 0)} hit / ${formatNumber(node['Shared Read Blocks'] || 0)} read`}
            />
          ) : null}
          {node['Rows Removed by Filter'] ? (
            <Metric
              label="filtered out"
              value={formatNumber(node['Rows Removed by Filter'])}
              tone="warn"
            />
          ) : null}
        </div>
        {node['Filter'] || node['Index Cond'] || node['Hash Cond'] || node['Recheck Cond'] ? (
          <div className={styles.conds}>
            {node['Index Cond'] ? <Cond label="Index Cond" value={node['Index Cond']} /> : null}
            {node['Hash Cond'] ? <Cond label="Hash Cond" value={node['Hash Cond']} /> : null}
            {node['Recheck Cond'] ? <Cond label="Recheck Cond" value={node['Recheck Cond']} /> : null}
            {node['Filter'] ? <Cond label="Filter" value={node['Filter']} /> : null}
          </div>
        ) : null}
      </div>
      {hasChildren && open ? (
        <div className={styles.children}>
          {children.map((child, index) => (
            <PlanNodeRow
              key={index}
              node={child}
              totalTimeMs={totalTimeMs}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <span className={`${styles.metric} ${tone === 'warn' ? styles.metricWarn : ''}`.trim()}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </span>
  )
}

function Cond({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.cond}>
      <span className={styles.condLabel}>{label}:</span>
      <code className={styles.condValue}>{value}</code>
    </div>
  )
}

type ExplainPlanTreeProps = {
  value: unknown
  fallbackText: string
}

export function ExplainPlanTree({ value, fallbackText }: ExplainPlanTreeProps) {
  const [showRaw, setShowRaw] = useState(false)
  const roots = useMemo(() => parsePlan(value), [value])

  if (!roots) {
    return <pre className={styles.raw}>{fallbackText || 'No plan returned.'}</pre>
  }

  const totalTimeMs =
    totalExecutionTime(roots) ||
    roots.reduce((sum, root) => sum + (root.Plan['Actual Total Time'] || 0), 0)

  return (
    <div className={styles.container}>
      <div className={styles.summaryBar}>
        {roots.map((root, index) => (
          <div key={index} className={styles.summaryItem}>
            {root['Planning Time'] != null ? (
              <span>planning: {formatMs(root['Planning Time'])}</span>
            ) : null}
            {root['Execution Time'] != null ? (
              <span>execution: {formatMs(root['Execution Time'])}</span>
            ) : null}
          </div>
        ))}
        <button className={styles.rawToggle} onClick={() => setShowRaw((value) => !value)}>
          {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
        </button>
      </div>
      {showRaw ? <pre className={styles.raw}>{fallbackText}</pre> : null}
      <div className={styles.tree}>
        {roots.map((root, index) => (
          <PlanNodeRow key={index} node={root.Plan} totalTimeMs={totalTimeMs} depth={0} />
        ))}
      </div>
    </div>
  )
}
