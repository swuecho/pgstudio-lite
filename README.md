# PG Studio Lite

PostgreSQL web manager using the same framework style as Supabase Studio:

- Next.js (pages router)
- React + TypeScript
- Monaco editor
- API routes for SQL execution and table editing
- SQLite for query history metadata
- Zustand for SQL/Table UI state slices
- Service layer modules for API interactions (`features/sql`, `features/table`)
- React Query for server state (`connections`, `history`, `snippets`, `schema`, `table rows`)

## Included editors

- SQL Editor (Studio-like layout)
- Table Editor (browse tables, edit cells, insert row, delete row)

## SQL snippet features

- Create, update, rename, duplicate, and delete snippets
- Snippet-bound tabs (`Edit` opens/reuses a tab linked to the snippet)
- Inline snippet rename in the sidebar
- `Save` / `Update` / `Save As` flow for snippet-bound vs unbound tabs
- Autosave for dirty snippet-bound tabs
- Unsaved badge for snippet-bound tabs with local changes
- Keyboard shortcut: `Ctrl/Cmd+S` to save/update current snippet

## Reused from Supabase Studio

- Framework style and page/API split (Next.js pages + API routes)
- Monaco theme pattern from `apps/studio/components/interfaces/App/MonacoThemeProvider.tsx`
- Monaco CSS behavior adapted from `apps/studio/styles/monaco.scss`
- Monaco assets served from `apps/studio/public/monaco-editor`
- SQL `suffixWithLimit` logic copied from `apps/studio/components/interfaces/SQLEditor/SQLEditor.utils.ts`

## Run

```bash
cd /Users/hwu/dev/pgstudio/supabase/apps/pgstudio-lite
npm install
PG_CONNECTION_STRING='postgres://user:password@localhost:5432/postgres' npm run dev
```

Open:

- SQL Editor: [http://localhost:4180](http://localhost:4180)
- Table Editor: [http://localhost:4180/table-editor](http://localhost:4180/table-editor)

Optional:

```bash
PG_CONNECTION_NAME='local-dev'
```

Multiple connections:

```bash
PG_CONNECTIONS_JSON='[
  {"name":"local","connectionString":"postgres://user:password@localhost:5432/postgres","isDefault":true},
  {"name":"staging","connectionString":"postgres://user:password@localhost:5432/postgres_staging"}
]'
```

Notes:
- On first boot, connections are seeded from `PG_CONNECTIONS_JSON` (or `PG_CONNECTION_STRING` fallback).
- Connections are persisted in `data/history.db` (`db_connections` table).
- `GET|POST|PATCH|DELETE /api/connections` is available for runtime connection management.

## Test

```bash
npm run test
```

This runs Vitest unit tests for SQL and table service modules.

## State Architecture

- Server state: React Query (`@tanstack/react-query`)
  - SQL: connections, history, snippets, schema tables/columns
  - Table editor: connections, tables, rows
- UI/session state: Zustand
  - SQL: active tab, tab contents, nav tab, rename draft, panel expansion
  - Table editor: active table, filter/sort/pagination controls, insert draft, status text

## API routes

- `GET /api/connections`
- `POST|PATCH|DELETE /api/connections`
- `POST /api/query`
- `GET /api/history?limit=300`
- `DELETE /api/history`
- `GET|POST|PATCH|DELETE /api/snippets`
- `GET /api/tables`
- `GET|POST|PATCH|DELETE /api/tables/[table]/rows`
- `GET /api/monaco/*` and `GET /api/vs/*`

## Connection management UI

- Use `Manage` in SQL editor header or Table editor sidebar to:
  - add a connection
  - rename / rotate connection string
  - set default connection
  - delete connection
