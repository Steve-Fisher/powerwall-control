import { describe, expect, it } from 'vitest'
import { FleetClient } from './client'
import { TeslaApiError } from './http'
import { fakeHttp, testConfig } from './testUtils'
import { MemoryTokenStore, TokenManager } from './tokenManager'

const validTokens = () => new MemoryTokenStore({ accessToken: 'A', refreshToken: 'R', expiresAt: Date.now() + 3_600_000 })

describe('FleetClient', () => {
  it('sends the bearer token and unwraps { response }', async () => {
    const http = fakeHttp({ status: 200, data: { response: [
      { energy_site_id: 42, site_name: 'Home' },
      { vin: 'VEHICLE' },
    ] } })
    const client = new FleetClient(http, testConfig, new TokenManager(http, testConfig, validTokens()))

    expect(await client.energySites()).toEqual([{ energy_site_id: 42, site_name: 'Home' }])
    expect(http.requests[0]).toMatchObject({
      method: 'GET',
      url: 'https://fleet-api.example/api/1/products',
      headers: { Authorization: 'Bearer A' },
    })
  })

  it('refreshes and retries once after a 401', async () => {
    const http = fakeHttp(
      { status: 401, data: {} },
      { status: 200, data: { access_token: 'A2', refresh_token: 'R2', expires_in: 3600 } },
      { status: 200, data: { response: { percentage_charged: 55 } } },
    )
    const client = new FleetClient(http, testConfig, new TokenManager(http, testConfig, validTokens()))

    expect(await client.liveStatus(42)).toEqual({ percentage_charged: 55 })
    expect(http.requests[2]!.headers).toMatchObject({ Authorization: 'Bearer A2' })
  })

  it('throws TeslaApiError with the status for other failures', async () => {
    const http = fakeHttp({ status: 404, data: { error: 'not found' } })
    const client = new FleetClient(http, testConfig, new TokenManager(http, testConfig, validTokens()))

    const err = await client.siteInfo(42).catch(e => e)
    expect(err).toBeInstanceOf(TeslaApiError)
    expect(err).toMatchObject({ status: 404, message: expect.stringContaining('not found') })
  })
})
