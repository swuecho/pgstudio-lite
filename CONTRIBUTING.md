# Contributing to PG Studio Lite

Thanks for helping improve PG Studio Lite. This document covers how to set up a dev environment, run checks, and what we look for in changes.

## Prerequisites

- **Node.js**: **Node 22**, pinned in [`.nvmrc`](./.nvmrc) and enforced by the `engines` field in `package.json` (with `engine-strict=true` in `.npmrc`). CI reads the same file, so local and CI always agree. With nvm:

  ```bash
  nvm use
  ```

  This matters more than usual here: `better-sqlite3` is a native addon, and switching Node majors leaves you with binaries compiled for the wrong ABI. If tests fail with `NODE_MODULE_VERSION`, run `npm rebuild better-sqlite3`.

  The desktop build needs the same addon compiled for Electron's ABI, which is a different one. It is kept out of `node_modules` on purpose — `npm run desktop:native` downloads it to `native/<platform>-<arch>/` and `lib/meta-db.ts` loads it from there — so packaging never disturbs the Node-ABI build that `npm test` and `next dev` use. Never run `electron-rebuild` or `electron-builder install-app-deps` against this repo's `node_modules`.

- **npm**: this repo uses `package-lock.json`; install dependencies with `npm ci` in CI-like workflows, or `npm install` locally.
- **PostgreSQL**: a reachable instance for the SQL editor, table editor, and notebook SQL cells. The app talks to Postgres over TCP using `pg`.

## Getting started

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file and point it at your database:

   ```bash
   cp .env.example .env.local
   ```

   Set at least `PG_CONNECTION_STRING`. See the main [README](./README.md) for optional variables (`PG_CONNECTION_NAME`, `PG_CONNECTION_READ_ONLY`, `PG_CONNECTIONS_JSON`, `PGSTUDIO_META_DB_PATH`).

3. Start the dev server (port **4180**):

   ```bash
   npm run dev
   ```

4. Open [http://localhost:4180](http://localhost:4180) and use the SQL editor, table editor, or notebook routes as needed.

### First boot and connections

Saved connections, history, snippets, and notebooks live in a **local SQLite** file (default `data/history.db`). Env vars seed connections **only when the metadata DB has no saved connections yet**. If you change `.env.local` after the first run and nothing updates, read **First Run Notes** in the [README](./README.md).

## Project layout (high level)

- **`pages/`** — Next.js [Pages Router](https://nextjs.org/docs/pages) UI and `pages/api/*` route handlers.
- **`components/`** — React UI building blocks.
- **`lib/`** — Server logic, DB access, API helpers, and shared utilities.
- **`tests/`** — Vitest tests (unit and integration-style).
- **`drizzle/`** — Drizzle schema and SQL migrations for the metadata database.
- **`docs/`** — Additional specs and migration notes.

When in doubt, follow patterns in nearby files (naming, validation with Zod, error handling via `lib/api/errors`).

### Imports

Use the `@/` alias — mapped to the repo root in both `tsconfig.json` and `vitest.config.ts` — instead of climbing two or more directories:

```ts
import { splitStatements } from '@/lib/db' // not '../../lib/db'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
```

Single-level relative imports (`./sibling`, `../parent`) stay relative; they survive file moves fine and read better up close.

### Touching the metadata DB

`lib/meta-db.ts` opens SQLite **lazily**. Import `getMetaDb()` / `getSqlite()` and call them inside the function that queries — never hoist the handle to a module-level `const`. Opening at import time makes every module that transitively reaches `lib/db` pay for a native addon and a file handle, including pure helpers and the tests that cover them.

## Commands

| Command                    | Purpose                                         |
| -------------------------- | ----------------------------------------------- |
| `npm run dev`              | Development server on port 4180                 |
| `npm run build`            | Production build                                |
| `npm run start`            | Run production build (port 4180)                |
| `npm run typecheck`        | TypeScript (`tsc --noEmit`)                     |
| `npm run lint`             | ESLint                                          |
| `npm run test`             | Vitest (single run)                             |
| `npm run test:integration` | Vitest: real Postgres smoke tests (see below)   |
| `npm run test:watch`       | Vitest watch mode                               |
| `npm run format`           | Prettier write                                  |
| `npm run format:check`     | Prettier check (no writes)                      |
| `npm run db:generate`      | Generate Drizzle migrations from schema changes |
| `npm run db:migrate`       | Apply migrations via Drizzle Kit                |

Migrations always run when the app opens the metadata DB. Schema changes go in a migration and nowhere else: do not add `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE` fallbacks to `lib/meta-db.ts`. For **discipline when authoring migrations**, see [docs/migrations/README.md](./docs/migrations/README.md).

## Before you open a pull request

Run the same checks you expect CI to exercise:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run test
```

If Prettier reports issues, fix them with `npm run format`.

If your change touches `pages/api/**` or `electron/**`, also verify the desktop build. `npm run dev` does not exercise the `app://` protocol handler or the API shim, so a regression there is invisible to the normal checks:

```bash
npm run desktop:build
npx electron . --smoke --user-data-dir /tmp/pgstudio-smoke
```

See [Desktop app](./README.md#desktop-app) for what the smoke run covers and how to include the Postgres paths.

## Tests

- Tests live under **`tests/`** and use **Vitest** with **jsdom** where UI is involved.
- Prefer focused tests next to the behavior they protect; reuse existing helpers and fixtures if present.
- If a change touches API contracts or parsing, add or extend tests that cover success and validation/error paths where practical.

### Postgres integration tests

[`tests/pg.integration.test.ts`](./tests/pg.integration.test.ts) exercises **`lib/db`** against a real PostgreSQL instance (no mocked `executeQuery`). They are **skipped** in a normal `npm test` run unless you opt in:

```bash
export PGSTUDIO_PG_INTEGRATION=1
export PG_CONNECTION_STRING='postgres://user:pass@localhost:5432/dbname'
export PG_CONNECTION_NAME=default   # optional; must match a seeded connection name
npm run test:integration
```

GitHub Actions runs the same command in the **`pg-integration`** job (with a Postgres 16 service container), after Prettier, ESLint, and typecheck. Use a disposable local database, not production credentials.

## Security and secrets

- **Do not commit** `.env`, `.env.local`, connection strings, or `data/history.db`. They are ignored for a reason; keep credentials out of the issue tracker and PR descriptions.
- PG Studio Lite is aimed at **local** use; treat any networked deployment as a separate, security-sensitive concern (API surface, auth, headers).

## Pull requests

- Keep changes **scoped** to the problem you are solving; unrelated refactors belong in their own PR when possible.
- Describe **what** changed and **why** in the PR body so reviewers can follow intent without diff archaeology.
- If behavior is user-visible, mention how you verified it (manual steps or tests).

## Questions

Open an issue for larger design questions, or ask in the PR if something is ambiguous. The [README](./README.md) troubleshooting section covers common local setup pitfalls.
