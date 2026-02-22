export class HttpError extends Error {
  status: number
  code?: string
  details?: unknown

  constructor(message: string, input: { status: number; code?: string; details?: unknown }) {
    super(message)
    this.name = 'HttpError'
    this.status = input.status
    this.code = input.code
    this.details = input.details
  }
}

export async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const body = await response.json()
  if (!response.ok) {
    throw new HttpError(body.error || `Request failed: ${response.status}`, {
      status: response.status,
      code: typeof body.code === 'string' ? body.code : undefined,
      details: body.details,
    })
  }
  return body as T
}
