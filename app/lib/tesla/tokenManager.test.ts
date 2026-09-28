import { describe, expect, it, vi } from 'vitest'
import { SignedOutError } from './oauth'
import { fakeHttp, testConfig } from './testUtils'
import { MemoryTokenStore, TokenManager } from './tokenManager'

const NOW = 1_000_000_000

describe('TokenManager', () => {
  it('returns the stored access token while it is valid', async () => {
    const store = new MemoryTokenStore({ accessToken: 'A', refreshToken: 'R', expiresAt: NOW + 3_600_000 })
    const http = fakeHttp()
    const tm = new TokenManager(http, testConfig, store, undefined, () => NOW)

    expect(await tm.getAccessToken()).toBe('A')
    expect(http.requests).toHaveLength(0)
  })

  it('refreshes near expiry and saves the rotated refresh token', async () => {
    const store = new MemoryTokenStore({ accessToken: 'A', refreshToken: 'R1', expiresAt: NOW + 30_000 })
    const http = fakeHttp({ status: 200, data: { access_token: 'A2', refresh_token: 'R2', expires_in: 28_800 } })
    const tm = new TokenManager(http, testConfig, store, undefined, () => NOW)

    expect(await tm.getAccessToken()).toBe('A2')
    expect(http.requests[0]!.form).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'R1' })
    expect(await store.load()).toEqual({ accessToken: 'A2', refreshToken: 'R2', expiresAt: NOW + 28_800_000 })
  })

  it('shares one refresh between concurrent callers', async () => {
    const store = new MemoryTokenStore({ accessToken: 'A', refreshToken: 'R1', expiresAt: 0 })
    const http = fakeHttp({ status: 200, data: { access_token: 'A2', refresh_token: 'R2', expires_in: 60 } })
    const tm = new TokenManager(http, testConfig, store, undefined, () => NOW)

    const results = await Promise.all([tm.getAccessToken(), tm.getAccessToken(), tm.forceRefresh()])

    expect(results).toEqual(['A2', 'A2', 'A2'])
    expect(http.requests).toHaveLength(1)
  })

  it('clears tokens and signals sign-out when the refresh token is rejected', async () => {
    const store = new MemoryTokenStore({ accessToken: 'A', refreshToken: 'R1', expiresAt: 0 })
    const http = fakeHttp({ status: 401, data: { error: 'invalid_grant' } })
    const onSignedOut = vi.fn()
    const tm = new TokenManager(http, testConfig, store, onSignedOut, () => NOW)

    await expect(tm.getAccessToken()).rejects.toBeInstanceOf(SignedOutError)
    expect(await store.load()).toBeNull()
    expect(onSignedOut).toHaveBeenCalledOnce()
  })

  it('keeps tokens when the refresh fails for another reason, e.g. offline', async () => {
    const tokens = { accessToken: 'A', refreshToken: 'R1', expiresAt: 0 }
    const store = new MemoryTokenStore(tokens)
    const http = async () => { throw new Error('network down') }
    const tm = new TokenManager(http, testConfig, store, undefined, () => NOW)

    await expect(tm.getAccessToken()).rejects.toThrow('network down')
    expect(await store.load()).toEqual(tokens)
  })
})
