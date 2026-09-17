import { useCallback, useMemo, useState } from 'react'
import {
  addEntryAtPath,
  collectContainerPaths,
  containerKind,
  entriesOf,
  getAtPath,
  parseScalarInput,
  removeAtPath,
  renameKeyAtPath,
  scalarText,
  setAtPath,
  summarizeContainer,
} from '@/lib/json-tree'
import { scalarClass } from './JsonTreeView'
import styles from './JsonTreeView.module.css'

type JsonTreeEditorProps = {
  value: unknown
  onChange: (next: unknown) => void
  /** Nodes shallower than this depth start expanded; 1 expands the root only. */
  defaultExpandDepth?: number
}

type EditTarget = { path: string; field: 'key' | 'value' }

type NodeProps = {
  nodeKey: string | null
  value: unknown
  path: string[]
  depth: number
  /** Null at the root, which has no key and cannot be removed. */
  parentKind: 'object' | 'array' | null
  isExpanded: (id: string, depth: number) => boolean
  onToggle: (id: string, depth: number) => void
  editing: EditTarget | null
  setEditing: (target: EditTarget | null) => void
  onEditValue: (path: string[], text: string) => void
  onRenameKey: (path: string[], nextKey: string) => void
  onRemove: (path: string[]) => void
  onAdd: (path: string[]) => void
}

/** Commits on Enter and on blur; Escape leaves the value untouched. */
function InlineInput({
  defaultValue,
  ariaLabel,
  onCommit,
  onCancel,
}: {
  defaultValue: string
  ariaLabel: string
  onCommit: (text: string) => void
  onCancel: () => void
}) {
  return (
    <input
      className={styles.editInput}
      aria-label={ariaLabel}
      defaultValue={defaultValue}
      autoFocus
      size={Math.min(Math.max(defaultValue.length + 1, 6), 60)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => onCommit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onCommit(event.currentTarget.value)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
    />
  )
}

function EditableNode(props: NodeProps) {
  const {
    nodeKey,
    value,
    path,
    depth,
    parentKind,
    isExpanded,
    onToggle,
    editing,
    setEditing,
    onEditValue,
    onRenameKey,
    onRemove,
    onAdd,
  } = props

  const id = path.join('/')
  const kind = containerKind(value)
  const indent = { paddingLeft: `${depth * 14}px` }
  const label = nodeKey ?? 'root'

  const keyPart =
    nodeKey === null ? null : editing?.path === id && editing.field === 'key' ? (
      <InlineInput
        defaultValue={nodeKey}
        ariaLabel={`Rename key ${nodeKey}`}
        onCommit={(text) => onRenameKey(path, text)}
        onCancel={() => setEditing(null)}
      />
    ) : parentKind === 'array' ? (
      <span className={styles.key}>{nodeKey}</span>
    ) : (
      <button
        type="button"
        className={`${styles.key} ${styles.editable}`}
        aria-label={`Rename key ${nodeKey}`}
        title="Click to rename"
        onClick={() => setEditing({ path: id, field: 'key' })}
      >
        {nodeKey}
      </button>
    )

  const rowActions = (
    <span className={styles.rowActions}>
      {kind ? (
        <button
          type="button"
          className={styles.rowAction}
          aria-label={`Add entry to ${label}`}
          title="Add entry"
          onClick={() => onAdd(path)}
        >
          +
        </button>
      ) : null}
      {parentKind ? (
        <button
          type="button"
          className={styles.rowAction}
          aria-label={`Remove ${label}`}
          title="Remove"
          onClick={() => onRemove(path)}
        >
          ✕
        </button>
      ) : null}
    </span>
  )

  if (!kind) {
    return (
      <div className={styles.row} style={indent}>
        <span className={styles.toggleSpacer} />
        {keyPart}
        {nodeKey === null ? null : <span className={styles.punct}>:</span>}
        {editing?.path === id && editing.field === 'value' ? (
          <InlineInput
            defaultValue={scalarText(value)}
            ariaLabel={`Edit value of ${label}`}
            onCommit={(text) => onEditValue(path, text)}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <button
            type="button"
            className={`${styles.scalar} ${styles.editable} ${scalarClass(value)}`}
            aria-label={`Edit value of ${label}`}
            title="Click to edit"
            onClick={() => setEditing({ path: id, field: 'value' })}
          >
            {scalarText(value)}
          </button>
        )}
        {rowActions}
      </div>
    )
  }

  const expanded = isExpanded(id, depth)
  const open = kind === 'array' ? '[' : '{'
  const close = kind === 'array' ? ']' : '}'

  return (
    <>
      <div className={styles.row} style={indent}>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => onToggle(id, depth)}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
        >
          {expanded ? '▾' : '▸'}
        </button>
        {keyPart}
        {nodeKey === null ? null : <span className={styles.punct}>:</span>}
        <span className={styles.punct}>{open}</span>
        {expanded ? null : (
          <>
            <span className={styles.summary}>{summarizeContainer(value, kind)}</span>
            <span className={styles.punct}>{close}</span>
          </>
        )}
        {rowActions}
      </div>
      {expanded ? (
        <>
          {entriesOf(value).map(([childKey, child]) => (
            <EditableNode
              {...props}
              key={childKey}
              nodeKey={childKey}
              value={child}
              path={[...path, childKey]}
              depth={depth + 1}
              parentKind={kind}
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
 * The collapsible tree of {@link JsonTreeView}, made editable: keys and scalars
 * are edited in place, and entries can be added or removed. Scalar input is read
 * as JSON when it parses (`12`, `true`, `null`, `{}`) and as text otherwise, so
 * a value can change type without a separate type picker.
 */
export function JsonTreeEditor({ value, onChange, defaultExpandDepth = 2 }: JsonTreeEditorProps) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<EditTarget | null>(null)

  const isExpanded = useCallback(
    (id: string, depth: number) => overrides[id] ?? depth < defaultExpandDepth,
    [overrides, defaultExpandDepth]
  )

  const onToggle = useCallback(
    (id: string, depth: number) => {
      setOverrides((prev) => ({ ...prev, [id]: !(prev[id] ?? depth < defaultExpandDepth) }))
    },
    [defaultExpandDepth]
  )

  const containerPaths = useMemo(() => collectContainerPaths(value, '', []), [value])

  const setAll = useCallback(
    (expanded: boolean) => {
      const next: Record<string, boolean> = {}
      for (const path of containerPaths) next[path] = expanded
      setOverrides(next)
    },
    [containerPaths]
  )

  const handleEditValue = useCallback(
    (path: string[], text: string) => {
      setEditing(null)
      onChange(setAtPath(value, path, parseScalarInput(text)))
    },
    [onChange, value]
  )

  const handleRenameKey = useCallback(
    (path: string[], nextKey: string) => {
      setEditing(null)
      const trimmed = nextKey.trim()
      const oldKey = path[path.length - 1]
      if (trimmed === '' || trimmed === oldKey) return
      onChange(renameKeyAtPath(value, path.slice(0, -1), oldKey, trimmed))
    },
    [onChange, value]
  )

  const handleRemove = useCallback(
    (path: string[]) => {
      setEditing(null)
      onChange(removeAtPath(value, path.slice(0, -1), path[path.length - 1]))
    },
    [onChange, value]
  )

  const handleAdd = useCallback(
    (path: string[]) => {
      const added = addEntryAtPath(value, path)
      if (!added) return
      const id = path.join('/')
      setOverrides((prev) => ({ ...prev, [id]: true }))
      const childId = [...path, added.key].join('/')
      const targetKind = containerKind(getAtPath(value, path))
      setEditing({ path: childId, field: targetKind === 'array' ? 'value' : 'key' })
      onChange(added.root)
    },
    [onChange, value]
  )

  return (
    <div className={styles.wrapper}>
      <div className={styles.treeActions}>
        <button type="button" className="btn small" onClick={() => setAll(true)}>
          Expand all
        </button>
        <button type="button" className="btn small" onClick={() => setAll(false)}>
          Collapse all
        </button>
      </div>
      <div className={`${styles.tree} ${styles.treeEditable}`} aria-label="JSON tree editor">
        <EditableNode
          nodeKey={null}
          value={value}
          path={[]}
          depth={0}
          parentKind={null}
          isExpanded={isExpanded}
          onToggle={onToggle}
          editing={editing}
          setEditing={setEditing}
          onEditValue={handleEditValue}
          onRenameKey={handleRenameKey}
          onRemove={handleRemove}
          onAdd={handleAdd}
        />
      </div>
    </div>
  )
}
