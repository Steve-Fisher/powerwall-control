/**
 * Minimal HTTP abstraction. On the phone it's backed by CapacitorHttp (native
 * requests, no CORS); tests pass a fake.
 */
export interface HttpRequest {
  method: 'GET' | 'POST'
  url: string
  headers?: Record<string, string>
  params?: Record<string, string>
  /** Sent as application/json. */
  json?: unknown
  /** Sent as application/x-www-form-urlencoded. */
  form?: Record<string, string>
}

export interface HttpResponse<T = unknown> {
  status: number
  data: T
}

export type Http = (req: HttpRequest) => Promise<HttpResponse>

export class TeslaApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly url: string,
  ) {
    super(`Tesla API ${url} failed: HTTP ${status} ${describeBody(body)}`)
    this.name = 'TeslaApiError'
  }
}

function describeBody(body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    const message = b.error_description ?? b.error ?? b.message
    if (typeof message === 'string') return message
  }
  return typeof body === 'string' ? body.slice(0, 200) : ''
}
