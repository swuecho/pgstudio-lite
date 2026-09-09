import Router from 'next/router'
import type { ColumnForeignKey } from './types'
import { buildForeignKeyTableEditorHref } from './foreignKeyUtils'

type ModifierClick = { metaKey: boolean; ctrlKey: boolean; button?: number }

/** ⌘-click (macOS) or Ctrl-click with the primary button. */
export function isForeignKeyJumpClick(event: ModifierClick) {
  if (event.button !== undefined && event.button !== 0) return false
  return event.metaKey || event.ctrlKey
}

/**
 * Navigate the table editor to the row a foreign-key cell points at. Uses the
 * router singleton so grid cells don't each need a router context.
 */
export function jumpToReferencedRow(args: {
  connectionName: string
  foreignKey: ColumnForeignKey
  match: Record<string, unknown>
}) {
  void Router.push(buildForeignKeyTableEditorHref(args))
}
