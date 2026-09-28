import { Preferences } from '@capacitor/preferences'
import { SignedOutError } from '~/lib/tesla/oauth'
import type { LiveStatus, SiteInfo } from '~/lib/tesla/types'

const SITE_ID_KEY = 'site.id'
const TARIFF_BACKUP_KEY = 'site.tariffBackup'

export interface TariffBackup {
  siteId: number
  savedAt: string
  tariff: unknown
}

async function readJson<T>(key: string): Promise<T | null> {
  const { value } = await Preferences.get({ key })
  return value ? JSON.parse(value) as T : null
}

async function writeJson(key: string, value: unknown) {
  await Preferences.set({ key, value: JSON.stringify(value) })
}

export function useEnergySite() {
  const { client } = useTeslaAuth()
  const siteId = useState<number | null>('site.id', () => null)
  const siteInfo = useState<SiteInfo | null>('site.info', () => null)
  const liveStatus = useState<LiveStatus | null>('site.live', () => null)
  const hasBackup = useState('site.hasBackup', () => false)
  const loading = useState('site.loading', () => false)
  const error = useState<string | null>('site.error', () => null)

  async function findSiteId(): Promise<number> {
    const saved = await readJson<number>(SITE_ID_KEY)
    if (saved) return saved
    const sites = await client.energySites()
    if (sites.length === 0) throw new Error('No Powerwall found on this Tesla account.')
    // A household has one site in practice; picking between several can come later.
    const id = sites[0]!.energy_site_id
    await writeJson(SITE_ID_KEY, id)
    return id
  }

  /** Saves the site's tariff the first time we see it, for "Restore original tariff". */
  async function backUpTariffOnce(id: number, info: SiteInfo) {
    const existing = await readJson<TariffBackup>(TARIFF_BACKUP_KEY)
    if (existing?.siteId === id) {
      hasBackup.value = true
      return
    }
    if (info.tariff_content_v2 === undefined) return
    await writeJson(TARIFF_BACKUP_KEY, { siteId: id, savedAt: new Date().toISOString(), tariff: info.tariff_content_v2 })
    hasBackup.value = true
  }

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      const id = siteId.value ?? await findSiteId()
      siteId.value = id
      const [info, live] = await Promise.all([client.siteInfo(id), client.liveStatus(id)])
      siteInfo.value = info
      liveStatus.value = live
      await backUpTariffOnce(id, info)
    }
    catch (err) {
      // Sign-out is reported by useTeslaAuth; don't show it twice.
      if (!(err instanceof SignedOutError)) error.value = (err as Error).message
    }
    finally {
      loading.value = false
    }
  }

  async function forget() {
    await Preferences.remove({ key: SITE_ID_KEY })
    siteId.value = null
    siteInfo.value = null
    liveStatus.value = null
  }

  return { siteId, siteInfo, liveStatus, hasBackup, loading, error, refresh, forget }
}
