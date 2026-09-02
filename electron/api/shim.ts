/**
 * Runs a Next API-route handler outside Next.
 *
 * A full audit of `pages/api/**` shows the handlers touch exactly six members
 * of the req/res pair: `req.method`, `req.query`, `req.body`, and
 * `res.setHeader` / `res.status` / `res.json`|`res.send`. No `res.write`, no
 * `res.end`, no `req.headers`, no `req.cookies`, no streaming. The repo's own
 * tests (e.g. tests/notebook.api.e2e.test.ts) already drive the handlers
 * through a shim of exactly this shape, so this is an exercised code path
 * rather than a new abstraction.
 */
export type ApiHandler = (req: never, res: never) => unknown

export type ApiRequestInput = {
  method: string
  query: Record<string, string | string[]>
  body?: unknown
}

export type ApiResult = {
  status: number
  headers: Record<string, string>
  /** Set when the handler used res.json(). */
  body?: unknown
  /** Set when the handler used res.send() — the two Monaco routes and errors. */
  raw?: Buffer | string
}

export async function invokeHandler(handler: ApiHandler, input: ApiRequestInput): Promise<ApiResult> {
  const headers: Record<string, string> = {}
  let status = 200
  let body: unknown
  let raw: Buffer | string | undefined
  let written = false

  const res = {
    setHeader(name: string, value: string) {
      headers[name] = value
      return res
    },
    getHeader(name: string) {
      return headers[name]
    },
    status(code: number) {
      status = code
      return res
    },
    json(payload: unknown) {
      body = payload
      written = true
      return res
    },
    send(payload: Buffer | string) {
      raw = payload
      written = true
      return res
    },
    end() {
      written = true
      return res
    },
  }

  const req = { method: input.method, query: input.query, body: input.body }

  // Covers both the async handlers and the few synchronous ones
  // (notebooks/[id]/export.ts, notebooks/import.ts).
  await Promise.resolve((handler as (req: unknown, res: unknown) => unknown)(req, res))

  if (!written) {
    return {
      status: 500,
      headers,
      body: { error: 'Handler produced no response', code: 'INTERNAL_ERROR' },
    }
  }
  return { status, headers, body, raw }
}
