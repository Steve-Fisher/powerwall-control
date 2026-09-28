import { AUTHORIZE_URL, SCOPES, TOKEN_URL, type TeslaAppConfig } from './config'
import { TeslaApiError, type Http } from './http'
import { codeChallenge, randomString } from './pkce'

export interface Tokens {
  accessToken: string
  refreshToken: string
  /** Epoch milliseconds. */
  expiresAt: number
}

/** Kept between opening the login page and receiving the redirect (the app may be killed in between). */
export interface PendingAuth {
  state: string
  verifier: string
}

/** The refresh token was rejected; the user has to sign in again. */
export class SignedOutError extends Error {
  constructor(message = 'Tesla sign-in has expired. Please sign in again.') {
    super(message)
    this.name = 'SignedOutError'
  }
}

export async function startAuth(config: TeslaAppConfig): Promise<{ url: string, pending: PendingAuth }> {
  const pending: PendingAuth = { state: randomString(16), verifier: randomString(48) }
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: SCOPES,
    state: pending.state,
    code_challenge: await codeChallenge(pending.verifier),
    code_challenge_method: 'S256',
    prompt_missing_scopes: 'true',
  })
  return { url: `${AUTHORIZE_URL}?${query}`, pending }
}

/**
 * Extracts the auth code from the redirect, which arrives either as the https
 * App Link or as the custom-scheme fallback. Returns null for unrelated URLs.
 */
export function parseCallback(url: string, pending: PendingAuth | null): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    return null
  }
  const params = parsed.searchParams
  if (!params.has('code') && !params.has('error')) return null

  const error = params.get('error')
  if (error) throw new Error(`Tesla sign-in failed: ${params.get('error_description') || error}`)
  if (!pending) throw new Error('Unexpected sign-in redirect. Please start sign-in again.')
  if (params.get('state') !== pending.state) throw new Error('Sign-in state mismatch. Please start sign-in again.')
  return params.get('code')
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

async function postToken(http: Http, form: Record<string, string>): Promise<TokenResponse> {
  const res = await http({ method: 'POST', url: TOKEN_URL, form })
  if (res.status >= 200 && res.status < 300) return res.data as TokenResponse
  if (form.grant_type === 'refresh_token' && (res.status === 400 || res.status === 401)) {
    throw new SignedOutError()
  }
  throw new TeslaApiError(res.status, res.data, TOKEN_URL)
}

function toTokens(res: TokenResponse, now: number, previousRefreshToken?: string): Tokens {
  const refreshToken = res.refresh_token ?? previousRefreshToken
  if (!refreshToken) throw new Error('Tesla did not return a refresh token. Was offline_access granted?')
  return { accessToken: res.access_token, refreshToken, expiresAt: now + res.expires_in * 1000 }
}

export async function exchangeCode(
  http: Http, config: TeslaAppConfig, code: string, verifier: string, now = Date.now(),
): Promise<Tokens> {
  const res = await postToken(http, {
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: verifier,
    redirect_uri: config.redirectUri,
    audience: config.apiBase,
  })
  return toTokens(res, now)
}

export async function refreshTokens(
  http: Http, config: TeslaAppConfig, refreshToken: string, now = Date.now(),
): Promise<Tokens> {
  const res = await postToken(http, {
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: refreshToken,
  })
  return toTokens(res, now, refreshToken)
}
