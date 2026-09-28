import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { nativeHttp } from '~/lib/native/nativeHttp'
import { pendingAuthStore, secureTokenStore } from '~/lib/native/secureStore'
import { FleetClient, type TeslaClient } from '~/lib/tesla/client'
import type { TeslaAppConfig } from '~/lib/tesla/config'
import { MockTeslaClient } from '~/lib/tesla/mockClient'
import { exchangeCode, parseCallback, startAuth } from '~/lib/tesla/oauth'
import { TokenManager } from '~/lib/tesla/tokenManager'

export type AuthStatus = 'loading' | 'signedOut' | 'signingIn' | 'signedIn'

/** In a desktop browser the real API is unreachable (CORS), so sign-in is faked and the client is mocked. */
const useMock = !Capacitor.isNativePlatform()

let services: { config: TeslaAppConfig, tokens: TokenManager, client: TeslaClient } | null = null

export function useTeslaAuth() {
  const status = useState<AuthStatus>('tesla.authStatus', () => 'loading')
  const error = useState<string | null>('tesla.authError', () => null)

  if (!services) {
    const pub = useRuntimeConfig().public
    const config: TeslaAppConfig = {
      clientId: pub.teslaClientId,
      clientSecret: pub.teslaClientSecret,
      redirectUri: pub.teslaRedirectUri,
      apiBase: pub.teslaApiBase,
    }
    const tokens = new TokenManager(nativeHttp, config, secureTokenStore, () => {
      status.value = 'signedOut'
      error.value = 'Your Tesla sign-in has expired. Please sign in again.'
    })
    const client = useMock ? new MockTeslaClient() : new FleetClient(nativeHttp, config, tokens)
    services = { config, tokens, client }
  }
  const { config, tokens, client } = services

  async function init() {
    status.value = (await tokens.isSignedIn()) ? 'signedIn' : 'signedOut'
  }

  async function signIn() {
    error.value = null
    if (useMock) {
      await tokens.signIn({ accessToken: 'mock', refreshToken: 'mock', expiresAt: Date.now() + 8 * 3_600_000 })
      status.value = 'signedIn'
      return
    }
    if (!config.clientId) {
      error.value = 'No Tesla client ID configured. Fill in .env and rebuild.'
      return
    }
    const { url, pending } = await startAuth(config)
    await pendingAuthStore.save(pending)
    status.value = 'signingIn'
    await Browser.open({ url })
  }

  /** Handles a deep link. Returns true if it was a sign-in redirect. */
  async function handleRedirect(url: string): Promise<boolean> {
    const pending = await pendingAuthStore.load()
    let code: string | null
    try {
      code = parseCallback(url, pending)
    }
    catch (err) {
      await pendingAuthStore.clear()
      error.value = (err as Error).message
      status.value = (await tokens.isSignedIn()) ? 'signedIn' : 'signedOut'
      return true
    }
    if (!code || !pending) return false

    await Browser.close().catch(() => {})
    try {
      await tokens.signIn(await exchangeCode(nativeHttp, config, code, pending.verifier))
      error.value = null
      status.value = 'signedIn'
    }
    catch (err) {
      error.value = `Sign-in failed: ${(err as Error).message}`
      status.value = 'signedOut'
    }
    finally {
      await pendingAuthStore.clear()
    }
    return true
  }

  /** The user closed the login tab without finishing. */
  function cancelSignIn() {
    if (status.value === 'signingIn') status.value = 'signedOut'
  }

  async function signOut() {
    await tokens.signOut()
    status.value = 'signedOut'
  }

  return { status, error, client, isMock: useMock, init, signIn, handleRedirect, cancelSignIn, signOut }
}
