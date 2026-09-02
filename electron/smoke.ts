import { app, BrowserWindow } from 'electron'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { splitStatements } from '@/lib/db/query'

/**
 * Dev-only self-check, enabled with `--smoke`. Drives the real renderer over
 * app:// and reports whether the static site, Monaco, and the API dispatch all
 * work. Kept in-tree because `desktop:preview` is the only path that exercises
 * the protocol handler, so it needs to be cheap to re-verify.
 */
type Check = { name: string; ok: boolean; detail?: string }

/**
 * Point the smoke run at a real Postgres with
 * `PGSTUDIO_SMOKE_CONNECTION_STRING=...` to also exercise the pg path
 * (schema introspection, table rows, query execution). Without it the run
 * still covers everything SQLite-backed.
 */
const CONNECTION_STRING =
  process.env.PGSTUDIO_SMOKE_CONNECTION_STRING?.trim() || 'postgres://user@127.0.0.1:1/none'
const HAS_POSTGRES = Boolean(process.env.PGSTUDIO_SMOKE_CONNECTION_STRING?.trim())

export function runSmokeChecks(window: BrowserWindow) {
  const logPath = join(app.getPath('userData'), 'smoke.log')
  const checks: Check[] = []
  const write = (line: string) => appendFileSync(logPath, `${line}\n`)

  writeFileSync(logPath, '')

  const record = (name: string, ok: boolean, detail?: string) => {
    checks.push({ name, ok, detail })
    write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  :: ${detail}` : ''}`)
  }

  const run = <T>(js: string) =>
    Promise.race([
      window.webContents.executeJavaScript(js, true) as Promise<T>,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 30_000)),
    ])

  window.webContents.once('did-finish-load', async () => {
    try {
      const origin = await run<Record<string, unknown>>(`
        ({ origin: location.origin, secure: window.isSecureContext,
           clipboard: !!navigator.clipboard?.writeText, title: document.title })
      `)
      record('renderer served over app://', origin.origin === 'app://pgstudio', JSON.stringify(origin))

      const nav = await run<Record<string, unknown>>(`
        fetch('/activity').then(r => ({ ok: r.ok, status: r.status, type: r.headers.get('Content-Type'),
                                        csp: !!r.headers.get('Content-Security-Policy') }))
      `)
      record('extensionless page falls back to .html', nav.ok === true, JSON.stringify(nav))

      const conns = await run<Record<string, unknown>>(`
        fetch('/api/connections').then(async r => ({ ok: r.ok, status: r.status, body: await r.json() }))
      `)
      record('GET /api/connections (sqlite)', conns.ok === true, JSON.stringify(conns).slice(0, 200))

      const notFound = await run<Record<string, unknown>>(`
        fetch('/api/does-not-exist').then(async r => ({ ok: r.ok, status: r.status, body: await r.json() }))
      `)
      record('unknown API route returns 404 JSON', notFound.status === 404, JSON.stringify(notFound))

      const badMethod = await run<Record<string, unknown>>(`
        fetch('/api/query', { method: 'GET' }).then(async r => ({ status: r.status, allow: r.headers.get('Allow'),
                                                                  body: await r.json() }))
      `)
      record(
        'handler headers round-trip (Allow on 405)',
        badMethod.status === 405 && badMethod.allow === 'POST',
        JSON.stringify(badMethod)
      )

      const history = await run<Record<string, unknown>>(`
        fetch('/api/history?limit=5').then(async r => ({ ok: r.ok, status: r.status, body: await r.json() }))
      `)
      record('GET /api/history (query params)', history.ok === true, JSON.stringify(history).slice(0, 160))

      const monaco = await run<Record<string, unknown>>(`
        fetch('/api/monaco/loader.js').then(r => ({ ok: r.ok, status: r.status, type: r.headers.get('Content-Type') }))
      `)
      record('monaco loader served', monaco.ok === true, JSON.stringify(monaco))

      // The SQLite-backed routes resolve a connection name first, so create a
      // connection before exercising them. This also covers the connections
      // write path and cleans up after itself.
      const connectionRoundTrip = await run<Record<string, unknown>>(`
        (async () => {
          const created = await fetch('/api/connections', { method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ name:'smoke', connectionString: ${JSON.stringify(CONNECTION_STRING)},
                                   isDefault:true, readOnly:false }) })
            .then(async r => ({ status: r.status, body: await r.json() }))
          const listed = await fetch('/api/connections').then(async r => await r.json())
          return { created, count: listed?.connections?.length, configured: listed?.configured,
                   defaultName: listed?.defaultConnectionName }
        })()
      `)
      record(
        'POST /api/connections then GET reflects it',
        (connectionRoundTrip.created as { status: number }).status === 200 &&
          connectionRoundTrip.count === 1 &&
          connectionRoundTrip.configured === true,
        JSON.stringify(connectionRoundTrip).slice(0, 300)
      )

      const snippetRoundTrip = await run<Record<string, unknown>>(`
        (async () => {
          const created = await fetch('/api/snippets', { method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ title:'smoke-test', queryText:'select 1' }) })
            .then(async r => ({ status: r.status, body: await r.json() }))
          const id = created.body?.item?.id
          const listed = await fetch('/api/snippets').then(async r => ({ status: r.status, body: await r.json() }))
          const deleted = await fetch('/api/snippets', { method:'DELETE',
            headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) })
            .then(async r => ({ ok: r.ok, status: r.status, body: await r.json() }))
          const after = await fetch('/api/snippets').then(async r => (await r.json()).items?.length)
          return { created, id, listedCount: listed.body?.items?.length, deleted, after }
        })()
      `)
      record(
        'POST + GET + DELETE-with-body /api/snippets',
        Boolean(snippetRoundTrip.id) &&
          (snippetRoundTrip.deleted as { ok: boolean } | undefined)?.ok === true &&
          snippetRoundTrip.listedCount === 1 &&
          snippetRoundTrip.after === 0,
        JSON.stringify(snippetRoundTrip).slice(0, 400)
      )

      if (HAS_POSTGRES) {
        const tables = await run<Record<string, unknown>>(`
          fetch('/api/tables?connectionName=smoke').then(async r => ({ ok: r.ok, status: r.status,
            body: await r.json() }))
        `)
        const tableNames = ((tables.body as { tables?: { table: string }[] })?.tables ?? []).map(
          (entry) => entry.table
        )
        record(
          'GET /api/tables against real Postgres',
          tables.ok === true && tableNames.includes('authors') && tableNames.includes('books'),
          JSON.stringify(tableNames).slice(0, 200)
        )

        const queryResult = await run<Record<string, unknown>>(`
          fetch('/api/query', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ query:'select name from authors order by name;', connectionName:'smoke' }) })
            .then(async r => ({ ok: r.ok, status: r.status, body: await r.json() }))
        `)
        record(
          'POST /api/query executes SQL end to end',
          queryResult.ok === true && JSON.stringify(queryResult.body).includes('Borges'),
          JSON.stringify(queryResult.body).slice(0, 260)
        )

        const multi = await run<Record<string, unknown>>(`
          fetch('/api/query', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ query:'select 1 as a; select 2 as b;', connectionName:'smoke' }) })
            .then(async r => ({ ok: r.ok, status: r.status, body: await r.json() }))
        `)
        record(
          'multi-statement query splits via wasm parser',
          multi.ok === true,
          JSON.stringify(multi.body).slice(0, 200)
        )

        const rows = await run<Record<string, unknown>>(`
          fetch('/api/tables/books/rows?connectionName=smoke&schema=public&limit=10')
            .then(async r => ({ ok: r.ok, status: r.status, body: await r.json() }))
        `)
        record(
          'GET /api/tables/:table/rows (dynamic route param)',
          rows.ok === true && JSON.stringify(rows.body).includes('Ficciones'),
          JSON.stringify(rows.body).slice(0, 240)
        )

        const ddl = await run<Record<string, unknown>>(`
          fetch('/api/tables/books/ddl?connectionName=smoke&schema=public')
            .then(async r => ({ ok: r.ok, status: r.status, body: await r.json() }))
        `)
        record(
          'GET /api/tables/:table/ddl',
          ddl.ok === true && JSON.stringify(ddl.body).includes('books'),
          JSON.stringify(ddl.body).slice(0, 200)
        )

        const activity = await run<Record<string, unknown>>(`
          fetch('/api/activity/sessions?connectionName=smoke')
            .then(async r => ({ ok: r.ok, status: r.status, body: await r.json() }))
        `)
        record(
          'GET /api/activity/sessions',
          activity.ok === true,
          JSON.stringify(activity.body).slice(0, 160)
        )

        const historyAfter = await run<Record<string, unknown>>(`
          fetch('/api/history?limit=5').then(async r => (await r.json()).items?.length)
        `)
        record('query history recorded to SQLite', Number(historyAfter) > 0, String(historyAfter))
      } else {
        write('note: PGSTUDIO_SMOKE_CONNECTION_STRING unset, skipping Postgres checks')
      }

      const validation = await run<Record<string, unknown>>(`
        fetch('/api/query', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({}) })
          .then(async r => ({ status: r.status, body: await r.json() }))
      `)
      record(
        'POST /api/query validates body via zod',
        validation.status === 400,
        JSON.stringify(validation).slice(0, 200)
      )

      // Checked in the main process rather than over app://: this is where the
      // libpg-query wasm actually loads, and esbuild rewriting the dynamic
      // import in lib/pg-parser.ts is the failure mode worth catching.
      try {
        const statements = await splitStatements('select 1; select 2;')
        record(
          'libpg-query wasm loads (splitStatements)',
          statements.length === 2,
          JSON.stringify(statements)
        )
      } catch (error) {
        record(
          'libpg-query wasm loads (splitStatements)',
          false,
          error instanceof Error ? error.message : String(error)
        )
      }
    } catch (error) {
      record('smoke run', false, error instanceof Error ? error.message : String(error))
    }

    // Leave the metadata DB as we found it.
    try {
      await run(`
        (async () => {
          const listed = await fetch('/api/connections').then(r => r.json())
          const smoke = (listed?.connections ?? []).find(c => c.name === 'smoke')
          if (!smoke) return 'none'
          return fetch('/api/connections', { method:'DELETE', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ id: smoke.id }) }).then(r => r.status)
        })()
      `)
    } catch {
      write('note: could not clean up the smoke connection')
    }

    const passed = checks.filter((check) => check.ok).length
    write(`\nRESULT ${passed}/${checks.length} passed`)
    const ok = checks.every((check) => check.ok)

    // Quit rather than exit, so the `before-quit` shutdown path actually runs:
    // pools drained, SQLite WAL checkpointed and closed. `checkShutdown` in
    // main.ts verifies the result once the app is gone.
    process.exitCode = ok ? 0 : 1
    app.quit()
  })
}
