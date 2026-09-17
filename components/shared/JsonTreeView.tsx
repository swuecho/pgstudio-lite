import { useCallback, useMemo, useState } from 'react'
import {
  collectContainerPaths,
  containerKind,
  entriesOf,
  scalarText,
  summarizeContainer,
} from '@/lib/json-tree'
import styles from './JsonTreeView.module.css'

type JsonTreeViewProps = {
  data: unknown
  /** Nodes shallower than this depth start expanded; 1 expands the root only. */
  defaultExpandDepth?: number
}

export function scalarClass(value: unknown): string {
  if (value === null) return styles.null
  switch (typeof value) {
    case 'string':
      return styles.string
    case 'number':
      return styles.number
    case 'boolean':
      return styles.boolean
    default:
      return styles.other
  }
}

type NodeProps = {
  nodeKey: string | null
  value: unknown
  path: string
  depth: number
  isExpanded: (path: string, depth: number) => boolean
  onToggle: (path: string, depth: number) => void
}

function JsonNode({ nodeKey, value, path, depth, isExpanded, onToggle }: NodeProps) {
  const kind = containerKind(value)
  const indent = { paddingLeft: `${depth * 14}px` }

  if (!kind) {
    return (
      <div className={styles.row} style={indent}>
        <span className={styles.toggleSpacer} />
        {nodeKey === null ? null : (
          <>
            <span className={styles.key}>{nodeKey}</span>
            <span className={styles.punct}>:</span>
          </>
        )}
        <span className={`${styles.scalar} ${scalarClass(value)}`}>{scalarText(value)}</span>
      </div>
    )
  }

  const expanded = isExpanded(path, depth)
  const entries = entriesOf(value)
  const open = kind === 'array' ? '[' : '{'
  const close = kind === 'array' ? ']' : '}'

  return (
    <>
      <div className={styles.row} style={indent}>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => onToggle(path, depth)}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${nodeKey ?? 'root'}`}
        >
          {expanded ? '▾' : '▸'}
        </button>
        {nodeKey === null ? null : (
          <>
            <span className={styles.key}>{nodeKey}</span>
            <span className={styles.punct}>:</span>
          </>
        )}
        <span className={styles.punct}>{open}</span>
        {expanded ? null : (
          <>
            <span className={styles.summary}>{summarizeContainer(value, kind)}</span>
            <span className={styles.punct}>{close}</span>
          </>
        )}
      </div>
      {expanded ? (
        <>
          {entries.map(([key, child]) => (
            <JsonNode
              key={key}
              nodeKey={key}
              value={child}
              path={`${path}/${key}`}
              depth={depth + 1}
              isExpanded={isExpanded}
              onToggle={onToggle}
            />
          ))}
          <div className={styles.row} style={indent}>
            <span className={styles.toggleSpacer} />
            <span className={styles.punct}>{close}</span>
          </div>
        </>
      ) : null}
    </>
  )
}

/**
 * Collapsible, syntax-coloured JSON tree. Expansion is tracked as overrides on
 * top of a depth rule, so expand-all / collapse-all stay cheap for large values.
 */
export function JsonTreeView({ data, defaultExpandDepth = 1 }: JsonTreeViewProps) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

  const isExpanded = useCallback(
    (path: string, depth: number) => overrides[path] ?? depth < defaultExpandDepth,
    [overrides, defaultExpandDepth]
  )

  const onToggle = useCallback(
    (path: string, depth: number) => {
      setOverrides((prev) => ({ ...prev, [path]: !(prev[path] ?? depth < defaultExpandDepth) }))
    },
    [defaultExpandDepth]
  )

  const containerPaths = useMemo(() => collectContainerPaths(data, '', []), [data])
  const hasContainers = containerPaths.length > 0

  const setAll = useCallback(
    (expanded: boolean) => {
      const next: Record<string, boolean> = {}
      for (const path of containerPaths) next[path] = expanded
      setOverrides(next)
    },
    [containerPaths]
  )

  return (
    <div className={styles.wrapper}>
      {hasContainers ? (
        <div className={styles.treeActions}>
          <button type="button" className="btn small" onClick={() => setAll(true)}>
            Expand all
          </button>
          <button type="button" className="btn small" onClick={() => setAll(false)}>
            Collapse all
          </button>
        </div>
      ) : null}
      <div className={styles.tree} aria-label="JSON tree">
        <JsonNode nodeKey={null} value={data} path="" depth={0} isExpanded={isExpanded} onToggle={onToggle} />
      </div>
    </div>
  )
}
