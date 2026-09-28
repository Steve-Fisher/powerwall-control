import type { TeslaAppConfig } from './config'
import type { Http, HttpRequest, HttpResponse } from './http'

export const testConfig: TeslaAppConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://powerwall.example/auth/callback',
  apiBase: 'https://fleet-api.example',
}

/** A fake Http that records requests and replies from a queue of responses. */
export function fakeHttp(...responses: HttpResponse[]): Http & { requests: HttpRequest[] } {
  const requests: HttpRequest[] = []
  const http = async (req: HttpRequest) => {
    requests.push(req)
    const res = responses.shift()
    if (!res) throw new Error(`Unexpected request: ${req.method} ${req.url}`)
    return res
  }
  return Object.assign(http, { requests })
}
