import Link from 'next/link'
import { PageHead } from '@/components/shared/PageHead'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ThemeToggle from '../components/theme-toggle'
import { useActiveConnection } from '../components/shared/hooks/useActiveConnection'
import { fetchRowTrace, type TraceEdge, type TraceNode } from '../features/trace/trace.service'
import { buildTraceHref } from '../lib/trace-url'
import styles from '../components/trace/TracePage.module.css'

const MAX_FIELDS_PREVIEW = 6
const MAX_FIELD_VALUE_LEN = 120

function decodePk(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }
  return null
}

function formatValue(value: unknown): string {
  if (value == null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1) + '…'
}

function pickPreviewFields(row: Record<string, unknown>, pk: Record<string, unknown> | null): string[] {
  const all = Object.keys(row)
  const pkKeys = pk ? Object.keys(pk) : []
  const rest = all.filter((key) => !pkKeys.includes(key))
  return [...pkKeys, ...rest].slice(0, MAX_FIELDS_PREVIEW)
}

type NodeViewProps = {
  node: TraceNode
  edge?: TraceEdge
  isRoot?: boolean
  onRerootHref: (node: TraceNode) => string | null
}

function NodeView({ node, edge, isRoot, onRerootHref }: NodeViewProps) {
  const previewFields = node.row ? pickPreviewFields(node.row, node.pk) : []
  const rerootHref = !isRoot ? onRerootHref(node) : null
  const fqn = `${node.schema}.${node.table}`
  const [parentsOpen, setParentsOpen] = useState(true)
  const [childrenOpen, setChildrenOpen] = useState(isRoot || node.depth < 2)

  return (
    <div className={[styles.nodeCard, isRoot ? styles.nodeCardRoot : ''].filter(Boolean).join(' ')}>
      <div className={styles.nodeHead}>
        {edge ? (
          <span className={`${styles.nodeRelation} ${styles[edge.direction]}`}>
            {edge.direction === 'parent' ? '↑ parent' : '↓ child'} via {edge.via}
          </span>
        ) : null}
        <span className={styles.nodeTitle}>{fqn}</span>
        {node.pk ? (
          <span className={styles.nodePkChip}>
            {Object.entries(node.pk)
              .map(([k, v]) => `${k}=${formatValue(v)}`)
              .join(', ')}
          </span>
        ) : null}
        {node.cycle ? (
          <span className={styles.cycleChip} title="This row already appears above; not expanded again.">
            ↩ already shown
          </span>
        ) : null}
        {rerootHref ? (
          <Link className={styles.rerootBtn} href={rerootHref}>
            Re-root here
          </Link>
        ) : null}
      </div>
      {node.row ? (
        <div className={styles.fieldList}>
          {previewFields.map((field) => (
            <Cell key={field} label={field} value={node.row![field]} />
          ))}
        </div>
      ) : (
        <div className="history-meta">No row data.</div>
      )}

      {node.parents.length > 0 ? (
        <div className={styles.subSection}>
          <button
            type="button"
            className={styles.subSectionTitle}
            onClick={() => setParentsOpen((value) => !value)}
            aria-expanded={parentsOpen}
          >
            <span className={styles.subSectionCaret}>{parentsOpen ? '▾' : '▸'}</span>
            Parents ({node.parents.length})
          </button>
          {parentsOpen ? (
            <div className={styles.children}>
              {node.parents.map((parentEdge, index) => (
                <NodeView
                  key={`p-${index}`}
                  node={parentEdge.node}
                  edge={parentEdge}
                  onRerootHref={onRerootHref}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {node.children.length > 0 ? (
        <div className={styles.subSection}>
          <button
            type="button"
            className={styles.subSectionTitle}
            onClick={() => setChildrenOpen((value) => !value)}
            aria-expanded={childrenOpen}
          >
            <span className={styles.subSectionCaret}>{childrenOpen ? '▾' : '▸'}</span>
            Children ({node.children.length}
            {node.childrenTotal > node.children.length ? ` of ${node.childrenTotal}` : ''})
          </button>
          {childrenOpen ? (
            <>
              {node.childrenTruncated ? (
                <div className={styles.truncatedNote}>
                  Showing first matches per relationship; more rows exist.
                </div>
              ) : null}
              <div className={styles.children}>
                {node.children.map((childEdge, index) => (
                  <NodeView
                    key={`c-${index}`}
                    node={childEdge.node}
                    edge={childEdge}
                    onRerootHref={onRerootHref}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Cell({ label, value }: { label: string; value: unknown }) {
  return (
    <>
      <div className={styles.fieldLabel}>{label}</div>
      <div className={styles.fieldValue}>{truncate(formatValue(value), MAX_FIELD_VALUE_LEN)}</div>
    </>
  )
}

export default function TracePage() {
  const router = useRouter()
  const { connectionName, connections, setConnectionName } = useActiveConnection()
  const requestedConnectionName =
    typeof router.query.connectionName === 'string' ? router.query.connectionName : ''
  const schema = typeof router.query.schema === 'string' ? router.query.schema : ''
  const table = typeof router.query.table === 'string' ? router.query.table : ''
  const pk = useMemo(() => decodePk(router.query.pk), [router.query.pk])
  const maxDepth = Number(router.query.depth) || 3

  useEffect(() => {
    if (!router.isReady || !requestedConnectionName || requestedConnectionName === connectionName) return
    setConnectionName(requestedConnectionName)
  }, [connectionName, requestedConnectionName, router.isReady, setConnectionName])

  const connectionMatchesUrl = !requestedConnectionName || requestedConnectionName === connectionName
  const enabled = Boolean(connectionName && connectionMatchesUrl && schema && table && pk)
  const query = useQuery({
    queryKey: ['trace', connectionName, schema, table, JSON.stringify(pk), maxDepth],
    queryFn: () =>
      fetchRowTrace({
        connectionName: connectionName!,
        schema,
        table,
        pk: pk!,
        maxDepth,
      }),
    enabled,
    refetchOnWindowFocus: false,
  })

  const rerootHref = (node: TraceNode): string | null => {
    if (!node.pk) return null
    return buildTraceHref({
      connectionName,
      schema: node.schema,
      table: node.table,
      pk: node.pk,
      depth: maxDepth,
    })
  }

  const errorMessage = query.error instanceof Error ? query.error.message : null

  return (
    <div className={styles.layoutRoot}>
      <aside className={styles.layoutRail}>
        <Link className={styles.railBtn} href="/">
          SQL
        </Link>
        <Link className={styles.railBtn} href="/table-editor">
          TB
        </Link>
        <Link className={styles.railBtn} href="/notebook">
          NB
        </Link>
        <Link className={styles.railBtn} href="/activity">
          AC
        </Link>
        <div className="mt-auto flex justify-center">
          <ThemeToggle />
        </div>
      </aside>

      <PageHead title="Trace" subject={schema && table ? `${schema}.${table}` : null} />
      <main className={styles.layoutMain}>
        <div className={styles.header}>
          <div className={styles.title}>Trace · {schema && table ? `${schema}.${table}` : 'no target'}</div>
          <div className={styles.controls}>
            <select
              value={maxDepth}
              onChange={(event) => {
                void router.replace({
                  pathname: router.pathname,
                  query: { ...router.query, depth: event.target.value },
                })
              }}
            >
              {[1, 2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  depth {value}
                </option>
              ))}
            </select>
            <select value={connectionName || ''} onChange={(event) => setConnectionName(event.target.value)}>
              {connections.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                  {c.readOnly ? ' (read-only)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.body}>
          {!enabled ? (
            <div className={styles.empty}>
              Open a row from the table editor (Trace button) to start a lineage walk.
            </div>
          ) : query.isLoading ? (
            <div className={styles.empty}>Walking foreign keys...</div>
          ) : errorMessage ? (
            <div className={styles.errorBox}>{errorMessage}</div>
          ) : query.data?.tree ? (
            <NodeView node={query.data.tree} isRoot onRerootHref={rerootHref} />
          ) : (
            <div className={styles.empty}>No trace returned.</div>
          )}
        </div>
      </main>
    </div>
  )
}
