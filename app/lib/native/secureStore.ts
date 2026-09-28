import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import type { PendingAuth, Tokens } from '~/lib/tesla/oauth'
import type { TokenStore } from '~/lib/tesla/tokenManager'

// Android Keystore-backed on the phone; localStorage in a desktop browser (dev only).
const TOKENS_KEY = 'tesla.tokens'
const PENDING_KEY = 'tesla.pendingAuth'

async function read<T>(key: string): Promise<T | null> {
  return (await SecureStorage.get(key)) as T | null
}

export const secureTokenStore: TokenStore = {
  load: () => read<Tokens>(TOKENS_KEY),
  save: tokens => SecureStorage.set(TOKENS_KEY, { ...tokens }),
  clear: async () => { await SecureStorage.remove(TOKENS_KEY) },
}

export const pendingAuthStore = {
  load: () => read<PendingAuth>(PENDING_KEY),
  save: (pending: PendingAuth) => SecureStorage.set(PENDING_KEY, { ...pending }),
  clear: async () => { await SecureStorage.remove(PENDING_KEY) },
}
