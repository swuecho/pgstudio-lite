import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { tableEditorBookmarks, tableEditorRecentViews } from '../../drizzle/schema'
import { metaDb } from '../meta-db'
import {
  dbFieldsToViewState,
  MAX_RECENT_VIEWS,
  viewStateToDbFields,
  type TableEditorBookmark,
  type TableEditorRecentView,
  type TableEditorViewState,
} from '../table-editor-views'
import { getConnectionByName } from './connections'

type TableEditorBookmarkRow = {
  id: string
  title: string
  pinned: boolean
  connection_name: string
  active_table: string
  filter_column: string | null
  filter_mode: string | null
  filter_value: string | null
  filter_value_end: string | null
  created_at: string
  updated_at: string
}

type TableEditorRecentViewRow = {
  id: string
  connection_name: string
  active_table: string
  filter_column: string | null
  filter_mode: string | null
  filter_value: string | null
  filter_value_end: string | null
  visited_at: string
}

function toTableEditorBookmarkRow(row: typeof tableEditorBookmarks.$inferSelect): TableEditorBookmarkRow {
  return {
    id: row.id,
    title: row.title,
    pinned: row.pinned,
    connection_name: row.connectionName,
    active_table: row.activeTable,
    filter_column: row.filterColumn,
    filter_mode: row.filterMode,
    filter_value: row.filterValue,
    filter_value_end: row.filterValueEnd,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

function toTableEditorRecentViewRow(
  row: typeof tableEditorRecentViews.$inferSelect
): TableEditorRecentViewRow {
  return {
    id: row.id,
    connection_name: row.connectionName,
    active_table: row.activeTable,
    filter_column: row.filterColumn,
    filter_mode: row.filterMode,
    filter_value: row.filterValue,
    filter_value_end: row.filterValueEnd,
    visited_at: row.visitedAt,
  }
}

function rowToTableEditorBookmark(row: TableEditorBookmarkRow): TableEditorBookmark {
  return {
    ...dbFieldsToViewState({
      connectionName: row.connection_name,
      activeTable: row.active_table,
      filterColumn: row.filter_column,
      filterMode: row.filter_mode,
      filterValue: row.filter_value,
      filterValueEnd: row.filter_value_end,
    }),
    id: row.id,
    title: row.title,
    pinned: row.pinned,
    createdAt: row.created_at,
  }
}

function rowToTableEditorRecentView(row: TableEditorRecentViewRow): TableEditorRecentView {
  return {
    ...dbFieldsToViewState({
      connectionName: row.connection_name,
      activeTable: row.active_table,
      filterColumn: row.filter_column,
      filterMode: row.filter_mode,
      filterValue: row.filter_value,
      filterValueEnd: row.filter_value_end,
    }),
    visitedAt: row.visited_at,
  }
}

export function getTableEditorViews(connectionName?: string) {
  const resolvedConnectionName = getConnectionByName(connectionName).name
  const bookmarks = metaDb
    .select()
    .from(tableEditorBookmarks)
    .where(eq(tableEditorBookmarks.connectionName, resolvedConnectionName))
    .orderBy(desc(tableEditorBookmarks.updatedAt))
    .all()
    .map(toTableEditorBookmarkRow)
    .map(rowToTableEditorBookmark)

  const recentViews = metaDb
    .select()
    .from(tableEditorRecentViews)
    .where(eq(tableEditorRecentViews.connectionName, resolvedConnectionName))
    .orderBy(desc(tableEditorRecentViews.visitedAt))
    .limit(MAX_RECENT_VIEWS)
    .all()
    .map(toTableEditorRecentViewRow)
    .map(rowToTableEditorRecentView)

  return { bookmarks, recentViews }
}

export function saveTableEditorBookmark(
  args: {
    connectionName?: string
    activeTable: string
    filter?: TableEditorViewState['filter']
  },
  title: string
) {
  const trimmedTitle = title.trim()
  if (!trimmedTitle || !args.activeTable) {
    throw new Error('title and activeTable are required')
  }

  const resolvedConnectionName = getConnectionByName(args.connectionName).name
  const view: TableEditorViewState = {
    connectionName: resolvedConnectionName,
    activeTable: args.activeTable,
    filter: args.filter,
  }
  const fields = viewStateToDbFields(view)
  const now = new Date().toISOString()
  const existing = metaDb
    .select()
    .from(tableEditorBookmarks)
    .where(
      and(
        eq(tableEditorBookmarks.connectionName, resolvedConnectionName),
        eq(tableEditorBookmarks.viewKey, fields.viewKey)
      )
    )
    .get()

  if (existing) {
    metaDb
      .update(tableEditorBookmarks)
      .set({ title: trimmedTitle, updatedAt: now })
      .where(eq(tableEditorBookmarks.id, existing.id))
      .run()
    const row = metaDb
      .select()
      .from(tableEditorBookmarks)
      .where(eq(tableEditorBookmarks.id, existing.id))
      .get()
    return row ? rowToTableEditorBookmark(toTableEditorBookmarkRow(row)) : null
  }

  const id = randomUUID()
  metaDb
    .insert(tableEditorBookmarks)
    .values({
      id,
      connectionName: resolvedConnectionName,
      title: trimmedTitle,
      pinned: false,
      activeTable: fields.activeTable,
      filterColumn: fields.filterColumn,
      filterMode: fields.filterMode,
      filterValue: fields.filterValue,
      filterValueEnd: fields.filterValueEnd,
      viewKey: fields.viewKey,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  const row = metaDb.select().from(tableEditorBookmarks).where(eq(tableEditorBookmarks.id, id)).get()
  return row ? rowToTableEditorBookmark(toTableEditorBookmarkRow(row)) : null
}

export function updateTableEditorBookmark({
  id,
  connectionName,
  title,
  pinned,
}: {
  id: string
  connectionName?: string
  title?: string
  pinned?: boolean
}) {
  const resolvedConnectionName = getConnectionByName(connectionName).name
  const values: Partial<typeof tableEditorBookmarks.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  }
  if (title !== undefined) values.title = title.trim()
  if (pinned !== undefined) values.pinned = pinned

  const result = metaDb
    .update(tableEditorBookmarks)
    .set(values)
    .where(
      and(eq(tableEditorBookmarks.id, id), eq(tableEditorBookmarks.connectionName, resolvedConnectionName))
    )
    .run()
  if (!result.changes) return null

  const row = metaDb
    .select()
    .from(tableEditorBookmarks)
    .where(
      and(eq(tableEditorBookmarks.id, id), eq(tableEditorBookmarks.connectionName, resolvedConnectionName))
    )
    .get()
  return row ? rowToTableEditorBookmark(toTableEditorBookmarkRow(row)) : null
}

export function deleteTableEditorBookmark(id: string, connectionName?: string) {
  const resolvedConnectionName = getConnectionByName(connectionName).name
  metaDb
    .delete(tableEditorBookmarks)
    .where(
      and(eq(tableEditorBookmarks.id, id), eq(tableEditorBookmarks.connectionName, resolvedConnectionName))
    )
    .run()
}

export function recordTableEditorRecentView(args: {
  connectionName?: string
  activeTable: string
  filter?: TableEditorViewState['filter']
}) {
  if (!args.activeTable) return null

  const resolvedConnectionName = getConnectionByName(args.connectionName).name
  const view: TableEditorViewState = {
    connectionName: resolvedConnectionName,
    activeTable: args.activeTable,
    filter: args.filter,
  }
  const fields = viewStateToDbFields(view)
  const now = new Date().toISOString()
  const existing = metaDb
    .select()
    .from(tableEditorRecentViews)
    .where(
      and(
        eq(tableEditorRecentViews.connectionName, resolvedConnectionName),
        eq(tableEditorRecentViews.viewKey, fields.viewKey)
      )
    )
    .get()

  if (existing) {
    metaDb
      .update(tableEditorRecentViews)
      .set({ visitedAt: now })
      .where(eq(tableEditorRecentViews.id, existing.id))
      .run()
  } else {
    metaDb
      .insert(tableEditorRecentViews)
      .values({
        id: randomUUID(),
        connectionName: resolvedConnectionName,
        activeTable: fields.activeTable,
        filterColumn: fields.filterColumn,
        filterMode: fields.filterMode,
        filterValue: fields.filterValue,
        filterValueEnd: fields.filterValueEnd,
        viewKey: fields.viewKey,
        visitedAt: now,
      })
      .run()
  }

  const stale = metaDb
    .select({ id: tableEditorRecentViews.id })
    .from(tableEditorRecentViews)
    .where(eq(tableEditorRecentViews.connectionName, resolvedConnectionName))
    .orderBy(desc(tableEditorRecentViews.visitedAt))
    .offset(MAX_RECENT_VIEWS)
    .all()

  for (const row of stale) {
    metaDb.delete(tableEditorRecentViews).where(eq(tableEditorRecentViews.id, row.id)).run()
  }

  const saved = metaDb
    .select()
    .from(tableEditorRecentViews)
    .where(
      and(
        eq(tableEditorRecentViews.connectionName, resolvedConnectionName),
        eq(tableEditorRecentViews.viewKey, fields.viewKey)
      )
    )
    .get()

  return saved ? rowToTableEditorRecentView(toTableEditorRecentViewRow(saved)) : null
}

export function clearTableEditorRecentViews(connectionName?: string) {
  const resolvedConnectionName = getConnectionByName(connectionName).name
  metaDb
    .delete(tableEditorRecentViews)
    .where(eq(tableEditorRecentViews.connectionName, resolvedConnectionName))
    .run()
}

export function importTableEditorViewsFromLocalStorage(payload: {
  bookmarksByConnection: Record<string, TableEditorBookmark[]>
  recentViewsByConnection: Record<string, TableEditorRecentView[]>
}) {
  for (const [connectionName, bookmarks] of Object.entries(payload.bookmarksByConnection)) {
    for (const bookmark of bookmarks) {
      try {
        const saved = saveTableEditorBookmark(
          {
            connectionName: bookmark.connectionName || connectionName,
            activeTable: bookmark.activeTable,
            filter: bookmark.filter,
          },
          bookmark.title
        )
        if (saved && bookmark.pinned) {
          updateTableEditorBookmark({
            id: saved.id,
            connectionName: saved.connectionName,
            pinned: true,
          })
        }
      } catch {
        // Skip invalid or missing connections during one-time import.
      }
    }
  }

  for (const [connectionName, recentViews] of Object.entries(payload.recentViewsByConnection)) {
    for (const recentView of recentViews) {
      try {
        recordTableEditorRecentView({
          connectionName: recentView.connectionName || connectionName,
          activeTable: recentView.activeTable,
          filter: recentView.filter,
        })
      } catch {
        // Skip invalid or missing connections during one-time import.
      }
    }
  }
}
