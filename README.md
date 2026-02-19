# PG Studio Lite

PostgreSQL web manager using the same framework style as Supabase Studio:

- Next.js (pages router)
- React + TypeScript
- Monaco editor
- API routes for SQL execution and table editing
- SQLite for query history metadata

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

## API routes

- `GET /api/connections`
- `POST /api/query`
- `GET /api/history?limit=300`
- `DELETE /api/history`
- `GET|POST|PATCH|DELETE /api/snippets`
- `GET /api/tables`
- `GET|POST|PATCH|DELETE /api/tables/[table]/rows`
- `GET /api/monaco/*` and `GET /api/vs/*`
