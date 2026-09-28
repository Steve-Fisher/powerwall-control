import { describe, expect, it } from 'vitest'
import { codeChallenge, randomString } from './pkce'

describe('pkce', () => {
  it('matches the RFC 7636 appendix B test vector', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
      .toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('produces url-safe random strings of the expected length', () => {
    const s = randomString(48)
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(s).toHaveLength(64)
    expect(randomString(48)).not.toBe(s)
  })
})
