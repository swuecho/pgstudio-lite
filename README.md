# PG Studio Lite

For development setup, checks, and pull request expectations, see [CONTRIBUTING.md](./CONTRIBUTING.md).

PG Studio Lite is a local PostgreSQL manager built with Next.js. It runs either as a
web app (`npm run dev`) or as a macOS desktop app (see [Desktop app](#desktop-app)).
It includes:

- SQL Editor
- Table Editor
- Notebook editor with SQL, Markdown, and widget cells
- Notebook runs: run every cell on demand or on a schedule and keep a snapshot history
- SQLite-backed local metadata for history, snippets, notebooks, and saved connections

## Stack

- Next.js (pages router)
- React + TypeScript
- Monaco editor
- PostgreSQL via `pg`
- SQLite metadata via `better-sqlite3` + Drizzle ORM
- React Query for server state
- Zustand for UI/session state

## Quickstart

1. Install dependencies:

```bash
npm install
```

2. Create local env config:

```bash
cp .env.example .env.local
```

3. Set `PG_CONNECTION_STRING` in `.env.local` to a reachable PostgreSQL instance.

Example:

```bash
PG_CONNECTION_STRING=postgres://postgres:postgres@localhost:5432/postgres
PG_CONNECTION_NAME=local
PG_CONNECTION_READ_ONLY=false
```

4. Start the app:

```bash
npm run dev
```

5. Open:

- SQL Editor: [http://localhost:4180](http://localhost:4180)
- Table Editor: [http://localhost:4180/table-editor](http://localhost:4180/table-editor)
- Notebook: [http://localhost:4180/notebook](http://localhost:4180/notebook)

## First Run Notes

- On first boot, connections are seeded from `PG_CONNECTIONS_JSON` if present.
- If `PG_CONNECTIONS_JSON` is not set, the app falls back to `PG_CONNECTION_STRING`, `PG_CONNECTION_NAME`, and `PG_CONNECTION_READ_ONLY`.
- Seeded connections are only used when the local metadata DB has no saved connections yet.
- After first boot, connection changes are managed in the UI and persisted locally.

### Why edits to `.env.local` may appear to be ignored

The `PG_CONNECTION_*` and `PG_CONNECTIONS_JSON` env vars are **first-boot seed values only**. The seeder (`seedConnectionsIfEmpty` in `lib/db.ts`) checks the metadata DB and skips seeding entirely if **any** saved connection already exists. After that, the SQLite `db_connections` table is the source of truth — changing values in `.env.local` and restarting will not update an already-seeded row (name, connection string, read-only flag, etc.).

To apply changes after first boot, choose one:

1. Edit the connection in the app UI (`Manage` panel) — the intended path.
2. Update the row directly:
   ```bash
   sqlite3 data/history.db "UPDATE db_connections SET name='...', read_only=1 WHERE id='<id>';"
   ```
3. Re-seed from scratch (⚠️ wipes notebooks, query history, snippets, and all saved connections):
   ```bash
   mv data/history.db data/history.db.bak
   rm -f data/history.db-shm data/history.db-wal
   ```
   The next start will re-read `.env.local` and seed fresh.

## Environment Variables

Required:

- `PG_CONNECTION_STRING`
  Example: `postgres://postgres:postgres@localhost:5432/postgres`

Common optional:

- `PG_CONNECTION_NAME`
  Default: `default`
- `PG_CONNECTION_READ_ONLY`
  Values: `true` or `false`
  Default: `false`
- `PG_CONNECTIONS_JSON`
  Seed multiple saved connections on first boot.

Example:

```json
[
  {
    "name": "local",
    "connectionString": "postgres://postgres:postgres@localhost:5432/postgres",
    "isDefault": true,
    "readOnly": false
  },
  {
    "name": "staging",
    "connectionString": "postgres://postgres:postgres@localhost:5432/postgres_staging",
    "readOnly": true
  }
]
```

Advanced optional:

- `PGSTUDIO_META_DB_PATH`
  Override the local SQLite metadata DB path.
  Default: `./data/history.db`

## Local Persistence

The app stores local metadata in a SQLite database:

- Default path (web/dev): `data/history.db`
- Desktop app: `~/Library/Application Support/PgStudio Lite/history.db`
- Stores:
  - saved connections
  - query history
  - snippets
  - notebooks

This file is local-only and already ignored by git.

## Connection Management

Use `Manage` in the SQL editor or Table editor to:

- add a connection
- rotate a connection string
- rename a connection
- set the default connection
- delete a connection

Connections can also be marked read-only. In read-only mode:

- write SQL is rejected
- table insert/update/delete actions are blocked
- the UI labels the connection as read-only

## SQL query workflow

- **Run statement** (Cmd/Ctrl+Enter) executes selected text, or the highlighted statement under the cursor. **Run all** executes the entire tab.
- Each tab keeps its own connection and display limit. A deleted connection must be replaced explicitly before running that tab.
- **Display rows** selects 100, 250, or 500 rows per statement. SQL executes unchanged; the limit applies to displayed/exported rows, not database work. Use an explicit SQL `LIMIT` to reduce query work. Results are still buffered before the display limit is applied.
- Results show their source connection and execution time. Table and trace links keep that source even after changing the tab's connection. Older saved results without a source need to be rerun to enable those links.
- Failed queries preserve the previous successful results and show database details/hints. Errors with a reported position are underlined while the editor still matches the submitted SQL.

## Notebook runs and schedules

The **Runs** button on a notebook opens its run history. **Run now** executes
every SQL cell in order (a failing cell does not stop the others) and stores a
snapshot: each cell's content, widget values, and results or error at that
moment. The last 50 runs per notebook are kept.

A notebook can also run on a schedule (5 minutes to 24 hours). Scheduled runs
only happen while the app is running: the web build starts the ticker with the
Next server (`instrumentation.ts`), the desktop app starts it in the Electron
main process. A schedule whose time passed while the app was closed fires on the
next tick after start-up. Set `PGSTUDIO_DISABLE_SCHEDULER=1` to keep the web
server from running schedules (useful when several instances share a metadata
DB).

## Desktop app

The desktop build packages the same codebase as a macOS app with no Node install
and no dev server. Run it with:

```bash
npm run desktop:preview
```

Build distributables (unsigned `.dmg` + `.zip`, arm64 and x64) into `release/`:

```bash
npm run desktop:dist
```

### How it differs from the web build

There is no HTTP server at runtime. `next build` runs with `output: 'export'`
(`PGSTUDIO_TARGET=desktop`) to emit a static site into `out-desktop/`, and the
Electron main process serves it from a custom `app://pgstudio` scheme. That same
protocol handler dispatches `/api/*` straight to the existing `pages/api/**`
handler functions through a `NextApiRequest`/`NextApiResponse` shim, so
`lib/http.ts` and every `features/*/*.service.ts` call site are unchanged.

Consequences worth knowing:

- **No listening port.** The web build's API routes are unauthenticated and
  `/api/query` runs arbitrary SQL, so not opening a socket is the point.
- **`app://pgstudio` must stay the origin.** It is a secure context (needed by
  `navigator.clipboard`) and gives a stable origin for the eight modules that
  persist to `localStorage`. Changing it would silently discard every user's
  editor tabs, filters, and theme.
- **API routes are excluded from the export** by `pageExtensions: ['tsx','jsx']`,
  which works because every file under `pages/api/**` is `.ts` and every page is
  `.tsx`. `tests/desktop-api-route-extensions.test.ts` enforces that.
- **New API routes must be registered** in `electron/api/routes.ts`.
  `tests/desktop-routes.test.ts` asserts a bijection with `pages/api/**`, so a
  missing entry fails `npm test` rather than 404ing in a shipped build.

### Layout

| Path                                   | Purpose                                               |
| -------------------------------------- | ----------------------------------------------------- |
| `electron/main.ts`                     | App lifecycle, window, security guards                |
| `electron/protocol.ts`                 | `app://` scheme registration and request routing      |
| `electron/static.ts`                   | Serves `out-desktop/`, with `.html` fallbacks and CSP |
| `electron/monaco.ts`                   | Serves monaco's AMD bundle and workers                |
| `electron/api/{routes,router,shim}.ts` | Dispatch to `pages/api` handlers                      |
| `electron/smoke.ts`                    | `--smoke` self-check (see below)                      |
| `lib/runtime-paths.ts`                 | Single source of runtime paths for both builds        |

### Native SQLite

`better-sqlite3` is the only native addon, and Electron's `NODE_MODULE_VERSION`
differs from the Node the repo targets. Rather than rebuilding in place — which
would break `npm test` and `next dev` — `npm run desktop:native` downloads an
Electron-ABI prebuilt addon into `native/<platform>-<arch>/`, and
`lib/meta-db.ts` loads it via better-sqlite3's `nativeBinding` option.
`node_modules` stays at the Node ABI.

Electron is pinned deliberately: `better-sqlite3` publishes Electron prebuilds
only through Electron 42 (ABI 146), and 12.x cannot compile against Electron
43+/Node 24 V8 headers. Bumping Electron means checking prebuild availability
first.

### Verifying a desktop change

`npm run dev` does not exercise the protocol handler or the API shim, so run
this after touching `pages/api/**` or `electron/**`:

```bash
npm run desktop:build
npx electron . --smoke --user-data-dir /tmp/pgstudio-smoke
```

It drives the real renderer over `app://` and checks the static site, Monaco,
the API dispatch, the libpg-query wasm, and the shutdown WAL checkpoint. Add a
real database to also cover the Postgres paths:

```bash
PGSTUDIO_SMOKE_CONNECTION_STRING=postgres://user:pass@host:5432/db \
  npx electron . --smoke --user-data-dir /tmp/pgstudio-smoke
```

`--smoke` and `--capture <dir>` write to the metadata DB, so they default to a
throwaway profile under the temp directory rather than the real one.

## Commands

Development:

```bash
npm run dev
```

Production build:

```bash
npm run build
npm run start
```

Tests:

```bash
npm run test
npm run typecheck
```

Database migrations:

```bash
npm run db:generate
npm run db:migrate
```

Migrations also run automatically whenever the app opens the metadata DB, so `db:migrate` is only needed to inspect or apply them ahead of time. The migration journal is the single source of truth for the schema; `lib/meta-db.ts` never adds tables or columns on its own.

Desktop app:

```bash
npm run desktop:preview
npm run desktop:dist
```

## API Routes

- `GET /api/connections`
- `POST|PATCH|DELETE /api/connections`
- `POST /api/query`
- `GET /api/history?limit=300`
- `DELETE /api/history`
- `GET|POST|PATCH|DELETE /api/snippets`
- `GET|POST|PATCH|DELETE /api/notebooks`
- `GET /api/notebooks/[id]`
- `POST /api/notebooks/import`
- `GET /api/notebooks/[id]/export`
- `POST /api/notebooks/[id]/patch`
- `POST|PATCH|DELETE /api/notebooks/[id]/cells`
- `POST /api/notebooks/[id]/run-cell`
- `GET /api/tables`
- `GET|POST|PATCH|DELETE /api/tables/[table]/rows` (POST inserts a row)
- `GET /api/monaco/*`
- `GET /api/vs/*`

## Troubleshooting

No connections configured:

- Check `.env.local`
- Make sure `PG_CONNECTION_STRING` is set
- If you already started the app once, remember saved connections now come from the local SQLite metadata DB, not from env reseeding

PostgreSQL connection errors:

- Confirm the host, port, database, user, and password in `PG_CONNECTION_STRING`
- Confirm PostgreSQL accepts TCP connections from your machine
- Try the same connection string with `psql` to isolate app issues from DB issues

Want to reset local app state:

- Stop the app
- Delete `data/history.db`, `data/history.db-shm`, and `data/history.db-wal`
- Start the app again to reseed from env vars

Metadata DB path issues:

- Set `PGSTUDIO_META_DB_PATH` to a writable path
- The directory will be created automatically if needed

Stale Next build lock:

- If `next build` reports a lock error, stop any existing build/dev process using this repo and remove `.next/lock`

## Notes

- The Monaco integration, page structure, and SQL editor behavior are inspired by [Supabase Studio](https://github.com/supabase/supabase); no code is copied from it.
- The current UI is optimized for local development workflows rather than multi-user deployment.

## License

[MIT](./LICENSE) © Hao Wu
