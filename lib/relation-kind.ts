export type RelationKind = 'table' | 'view' | 'materialized_view'

export function mapPgRelkind(relkind: string): RelationKind {
  if (relkind === 'v') return 'view'
  if (relkind === 'm') return 'materialized_view'
  return 'table'
}

export function isMutableRelationKind(kind: RelationKind) {
  return kind === 'table'
}

export function relationKindLabel(kind: RelationKind) {
  if (kind === 'view') return 'view'
  if (kind === 'materialized_view') return 'matview'
  return 'table'
}

export function relationKindShortBadge(kind: RelationKind) {
  if (kind === 'view') return 'V'
  if (kind === 'materialized_view') return 'MV'
  return ''
}
