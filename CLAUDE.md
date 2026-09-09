# PG Studio Lite — agent notes

Local PostgreSQL manager: Next.js (pages router) + React + TypeScript, shipped as a
web app and as an Electron desktop app. Metadata (history, snippets, notebooks,
connections) lives in a local SQLite file via `better-sqlite3` + Drizzle.

[CONTRIBUTING.md](./CONTRIBUTING.md) is the full guide. This file is the short
list of things that are easy to get wrong.

## Commands

| Command                          | What it does                                                  |
| -------------------------------- | ------------------------------------------------------------- |
| `npm run check`                  | Prettier check, ESLint, typecheck, tests — what CI runs first |
| `npm run dev`                    | Dev server on <http://localhost:4180>                         |
| `npm test`                       | Vitest, single run (~4s)                                      |
| `npm run test:watch`             | Vitest watch mode                                             |
| `npm run test:integration`       | Real-Postgres tests; needs `PGSTUDIO_PG_INTEGRATION=1`        |
| `npm run test:integration:local` | Same, against the Docker Postgres from `npm run db:up`        |
| `npm run test:coverage`          | Vitest + v8 coverage summary; drill-down in `coverage/`       |
| `npm run db:up`                  | Local Postgres 16 via Docker Compose, seeds `demo` schema     |
| `npm run format`                 | Prettier write                                                |
| `npm run db:generate`            | New Drizzle migration from `drizzle/schema.ts`                |
| `npm run desktop:build`          | Static renderer + Electron main bundle                        |

Node 22 only (`.nvmrc`, `engine-strict`). If tests fail with `NODE_MODULE_VERSION`,
run `npm rebuild better-sqlite3`. Never run `electron-rebuild` against `node_modules`;
the Electron-ABI addon lives in `native/` and is fetched by `npm run desktop:native`.

A pre-commit hook (`simple-git-hooks` + `lint-staged`) runs Prettier and ESLint on
staged files. Run `npm run check` before opening a PR.

## Invariants (tests enforce most of these)

- **Schema lives only in `drizzle/migrations`.** `migrate()` runs on every open of
  the meta DB. Never add `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` fallbacks to
  `lib/meta-db.ts`. Authoring rules: [docs/migrations/README.md](./docs/migrations/README.md).
  After adding a migration run `npm run db:snapshots`; `tests/migration-snapshots.test.ts`
  checks that every journal entry has a snapshot matching its SQL.
- **Open the meta DB lazily.** Call `getMetaDb()` / `getSqlite()` inside the
  function that queries. Never hoist the handle to a module-level `const`.
- **Files under `pages/api/` are `.ts`, pages are `.tsx`.** The desktop build sets
  `pageExtensions: ['tsx', 'jsx']` to exclude API routes from the static export.
  Every API route also needs an entry in `electron/api/routes.ts`; `tests/desktop-routes.test.ts`
  checks both.
- **`public/theme-bootstrap.js` is generated** from `lib/theme.ts`. After changing
  `themeBootstrapScript()`, run `node scripts/generate-theme-bootstrap.mjs`.
- **API errors go through `lib/api/errors.ts`** (`badRequest`, `methodNotAllowed`,
  `sendApiError`). Validate request bodies with Zod, following nearby routes.
- **Imports:** use the `@/` alias for anything two or more directories up;
  single-level relative imports stay relative.

## Layout

- `pages/` — routes and `pages/api/*` handlers. Page files stay thin; UI lives in `components/<area>/`.
- `components/` — `sql-editor`, `table-editor`, `notebook`, `activity`, `trace`, `settings`, `shared`.
- `features/<area>/*.service.ts` — client-side fetch wrappers used by React Query hooks.
- `lib/` — server logic. `lib/db/` is Postgres access; `lib/meta-db.ts` and `lib/notebook-db.ts` (barrel over `lib/notebook-db/`) are SQLite.
- `electron/` — main process, `app://` protocol, and the API shim that dispatches `/api/*` to the same handlers.
- `tests/` — Vitest, flat directory, `*.test.ts(x)`. Each worker gets its own SQLite file under the OS tmpdir.

## Testing conventions

- API route tests call `invokeApi(handler, { method, query, body })` from
  `tests/helpers/invoke-api.ts` and mock `lib/db` with `vi.mock`. Route params
  such as `[table]` go in `query`. See `tests/query.api.test.ts`.
- UI tests use Testing Library + jsdom; `tests/setup.ts` loads jest-dom matchers.
- `tests/pg.integration.test.ts` is skipped unless `PGSTUDIO_PG_INTEGRATION=1`;
  `npm run db:up && npm run test:integration:local` runs it locally.
- If a change touches `pages/api/` or `electron/`, run `npm run desktop:build`
  and `npx electron . --smoke --user-data-dir /tmp/pgstudio-smoke`; `next dev`
  does not exercise the desktop protocol handler.

## Working style

- Keep changes scoped; refactors go in their own commit.
- Do not commit `.env*` (except `.env.example`), `data/`, or anything under `release/`, `out-desktop/`, `native/`.
- Commit messages follow `type(scope): summary` (see `git log`).
