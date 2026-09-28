import type { TeslaAppConfig } from './config'
import type { Http } from './http'
import { refreshTokens, SignedOutError, type Tokens } from './oauth'

export interface TokenStore {
  load(): Promise<Tokens | null>
  save(tokens: Tokens): Promise<void>
  clear(): Promise<void>
}

export class MemoryTokenStore implements TokenStore {
  constructor(private tokens: Tokens | null = null) {}
  async load() { return this.tokens }
  async save(tokens: Tokens) { this.tokens = tokens }
  async clear() { this.tokens = null }
}

/** Refresh this long before expiry so a request never goes out with a dying token. */
const EXPIRY_MARGIN_MS = 60_000

/**
 * Hands out valid access tokens, refreshing when needed. Tesla rotates refresh
 * tokens (the old one stops working), so each new pair is saved before use, and
 * concurrent callers share a single refresh.
 */
export class TokenManager {
  private refreshing: Promise<Tokens> | null = null

  constructor(
    private readonly http: Http,
    private readonly config: TeslaAppConfig,
    private readonly store: TokenStore,
    private readonly onSignedOut: () => void = () => {},
    private readonly now: () => number = Date.now,
  ) {}

  async isSignedIn(): Promise<boolean> {
    return (await this.store.load()) !== null
  }

  async signIn(tokens: Tokens): Promise<void> {
    await this.store.save(tokens)
  }

  async signOut(): Promise<void> {
    await this.store.clear()
  }

  async getAccessToken(): Promise<string> {
    const tokens = await this.store.load()
    if (!tokens) throw this.signedOut()
    if (tokens.expiresAt - EXPIRY_MARGIN_MS > this.now()) return tokens.accessToken
    return (await this.refresh(tokens)).accessToken
  }

  /** Called after a 401: the access token was rejected even though it hadn't expired. */
  async forceRefresh(): Promise<string> {
    const tokens = await this.store.load()
    if (!tokens) throw this.signedOut()
    return (await this.refresh(tokens)).accessToken
  }

  private refresh(tokens: Tokens): Promise<Tokens> {
    this.refreshing ??= (async () => {
      try {
        const fresh = await refreshTokens(this.http, this.config, tokens.refreshToken, this.now())
        await this.store.save(fresh)
        return fresh
      }
      catch (err) {
        if (err instanceof SignedOutError) {
          await this.store.clear()
          throw this.signedOut()
        }
        throw err
      }
      finally {
        this.refreshing = null
      }
    })()
    return this.refreshing
  }

  private signedOut(): SignedOutError {
    this.onSignedOut()
    return new SignedOutError()
  }
}
