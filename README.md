# PG Studio Lite

PG Studio Lite is a local PostgreSQL web manager built with Next.js. It includes:

- SQL Editor
- Table Editor
- Notebook editor with SQL, Markdown, and widget cells
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
- `SKIP_RUNTIME_MIGRATE`
  Set to `1` only if migrations are handled outside app startup.

## Local Persistence

The app stores local metadata in a SQLite database:

- Default path: `data/history.db`
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

Migrations also run automatically on server startup unless `SKIP_RUNTIME_MIGRATE=1`.

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

- Monaco integration, page structure, and some SQL editor behavior were adapted from Supabase Studio.
- The current UI is optimized for local development workflows rather than multi-user deployment.
