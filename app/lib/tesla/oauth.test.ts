import { describe, expect, it } from 'vitest'
import { AUTHORIZE_URL, TOKEN_URL } from './config'
import { TeslaApiError } from './http'
import { exchangeCode, parseCallback, refreshTokens, SignedOutError, startAuth } from './oauth'
import { codeChallenge } from './pkce'
import { fakeHttp, testConfig } from './testUtils'

describe('startAuth', () => {
  it('builds a PKCE authorize URL with the energy scopes', async () => {
    const { url, pending } = await startAuth(testConfig)
    const parsed = new URL(url)

    expect(`${parsed.origin}${parsed.pathname}`).toBe(AUTHORIZE_URL)
    const q = parsed.searchParams
    expect(q.get('client_id')).toBe('client-id')
    expect(q.get('redirect_uri')).toBe(testConfig.redirectUri)
    expect(q.get('scope')).toBe('openid offline_access energy_device_data energy_cmds')
    expect(q.get('state')).toBe(pending.state)
    expect(q.get('code_challenge_method')).toBe('S256')
    expect(q.get('code_challenge')).toBe(await codeChallenge(pending.verifier))
  })
})

describe('parseCallback', () => {
  const pending = { state: 'abc', verifier: 'v' }

  it('reads the code from the https App Link and the custom scheme', () => {
    expect(parseCallback('https://powerwall.example/auth/callback?code=C1&state=abc', pending)).toBe('C1')
    expect(parseCallback('uk.co.versible.powerwall://callback?code=C2&state=abc', pending)).toBe('C2')
  })

  it('ignores URLs that are not auth redirects', () => {
    expect(parseCallback('https://powerwall.example/', pending)).toBeNull()
    expect(parseCallback('not a url', pending)).toBeNull()
  })

  it('rejects a state mismatch or a redirect with no sign-in in progress', () => {
    expect(() => parseCallback('https://x/cb?code=C&state=other', pending)).toThrow(/state mismatch/)
    expect(() => parseCallback('https://x/cb?code=C&state=abc', null)).toThrow(/Unexpected/)
  })

  it('surfaces Tesla errors', () => {
    expect(() => parseCallback('https://x/cb?error=access_denied&error_description=User+said+no', pending))
      .toThrow('User said no')
  })
})

describe('token requests', () => {
  it('exchanges the code with the secret, verifier and audience', async () => {
    const http = fakeHttp({ status: 200, data: { access_token: 'A', refresh_token: 'R', expires_in: 3600 } })

    const tokens = await exchangeCode(http, testConfig, 'CODE', 'VERIFIER', 1_000)

    expect(tokens).toEqual({ accessToken: 'A', refreshToken: 'R', expiresAt: 1_000 + 3_600_000 })
    expect(http.requests[0]).toMatchObject({
      method: 'POST',
      url: TOKEN_URL,
      form: {
        grant_type: 'authorization_code',
        client_id: 'client-id',
        client_secret: 'client-secret',
        code: 'CODE',
        code_verifier: 'VERIFIER',
        redirect_uri: testConfig.redirectUri,
        audience: testConfig.apiBase,
      },
    })
  })

  it('keeps the old refresh token if Tesla does not send a new one', async () => {
    const http = fakeHttp({ status: 200, data: { access_token: 'A2', expires_in: 60 } })
    const tokens = await refreshTokens(http, testConfig, 'R1', 0)
    expect(tokens.refreshToken).toBe('R1')
  })

  it('treats a rejected refresh token as signed out', async () => {
    const http = fakeHttp({ status: 401, data: { error: 'invalid_grant' } })
    await expect(refreshTokens(http, testConfig, 'R1')).rejects.toBeInstanceOf(SignedOutError)
  })

  it('reports other token failures as API errors', async () => {
    const http = fakeHttp({ status: 400, data: { error: 'invalid_request', error_description: 'bad code' } })
    await expect(exchangeCode(http, testConfig, 'C', 'V')).rejects.toThrow(TeslaApiError)
  })
})
