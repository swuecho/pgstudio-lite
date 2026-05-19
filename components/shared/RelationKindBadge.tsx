import type { RelationKind } from '../../lib/relation-kind'
import { relationKindLabel, relationKindShortBadge } from '../../lib/relation-kind'
import styles from './RelationKindBadge.module.css'

type RelationKindBadgeProps = {
  kind: RelationKind
  compact?: boolean
}

export function RelationKindBadge({ kind, compact = false }: RelationKindBadgeProps) {
  if (kind === 'table') return null

  const short = relationKindShortBadge(kind)
  const label = relationKindLabel(kind)

  return (
    <span
      className={`${styles.badge} ${kind === 'materialized_view' ? styles.matview : styles.view}`}
      title={kind === 'materialized_view' ? 'Materialized view' : 'View'}
    >
      {compact ? short : label}
    </span>
  )
}
