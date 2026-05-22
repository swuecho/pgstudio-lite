import { describe, expect, it } from 'vitest'
import {
  buildViewState,
  filterViews,
  formatViewLabel,
  isSameView,
  partitionViewBookmarks,
  suggestBookmarkTitle,
  viewStateKey,
  type TableEditorBookmark,
  type TableEditorViewState,
} from '../lib/table-editor-views'

const filteredView: TableEditorViewState = {
  connectionName: 'staging',
  activeTable: 'public.order_items_mv',
  filter: {
    filterColumn: 'order_id',
    filterMode: 'equals',
    filterValue: 'd3849a58-f4fa-4044-b264-b1778d7067c8',
    filterValueEnd: '',
  },
}

const tableOnlyView: TableEditorViewState = {
  connectionName: 'staging',
  activeTable: 'public.users',
}

describe('table-editor-views', () => {
  it('builds stable view keys for dedupe', () => {
    expect(viewStateKey(filteredView)).toBe(viewStateKey({ ...filteredView }))
    expect(viewStateKey(filteredView)).not.toBe(viewStateKey(tableOnlyView))
    expect(isSameView(filteredView, { ...filteredView })).toBe(true)
  })

  it('builds view state from editor fields', () => {
    expect(
      buildViewState({
        connectionName: 'staging',
        activeTable: 'public.users',
        filterColumn: '',
        filterMode: 'contains',
        filterValue: '',
        filterValueEnd: '',
      })
    ).toEqual(tableOnlyView)

    expect(
      buildViewState({
        connectionName: 'staging',
        activeTable: 'public.order_items_mv',
        filterColumn: 'order_id',
        filterMode: 'equals',
        filterValue: 'abc',
        filterValueEnd: '',
      })?.filter
    ).toEqual({
      filterColumn: 'order_id',
      filterMode: 'equals',
      filterValue: 'abc',
      filterValueEnd: '',
    })
  })

  it('formats labels and bookmark titles', () => {
    expect(formatViewLabel(tableOnlyView)).toBe('users')
    expect(formatViewLabel(filteredView)).toContain('order_items_mv')
    expect(formatViewLabel(filteredView)).toContain('order_id')
    expect(suggestBookmarkTitle('public.order_items_mv', filteredView.filter)).toContain('order_items_mv')
  })

  it('filters views by title, table, and filter text', () => {
    const bookmarks: TableEditorBookmark[] = [
      {
        ...tableOnlyView,
        id: '1',
        title: 'All users',
        pinned: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        ...filteredView,
        id: '2',
        title: 'Order items lookup',
        pinned: true,
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ]

    expect(filterViews(bookmarks, 'order_id', (item) => item.title)).toHaveLength(1)
    expect(filterViews(bookmarks, 'all users', (item) => item.title)).toHaveLength(1)
    expect(filterViews(bookmarks, '', (item) => item.title)).toHaveLength(2)
  })

  it('partitions pinned and unpinned bookmarks', () => {
    const bookmarks: TableEditorBookmark[] = [
      {
        ...tableOnlyView,
        id: '1',
        title: 'Users',
        pinned: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        ...filteredView,
        id: '2',
        title: 'Order items',
        pinned: true,
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ]

    expect(partitionViewBookmarks(bookmarks)).toEqual({
      pinned: [bookmarks[1]],
      unpinned: [bookmarks[0]],
    })
  })
})
