import type { TeslaAppConfig } from './config'
import { TeslaApiError, type Http, type HttpRequest } from './http'
import type { TokenManager } from './tokenManager'
import type { EnergySite, LiveStatus, Product, SiteInfo } from './types'

export interface TeslaClient {
  energySites(): Promise<EnergySite[]>
  siteInfo(siteId: number): Promise<SiteInfo>
  liveStatus(siteId: number): Promise<LiveStatus>
  /** Uploads a `tariff_content_v2` as the site's time-of-use tariff. */
  setTariff(siteId: number, tariff: unknown): Promise<void>
  /** `autonomous` is Time-Based Control in the Tesla app; `self_consumption` is Self-Powered. */
  setOperationMode(siteId: number, mode: OperationMode): Promise<void>
  allowGridCharging(siteId: number): Promise<void>
}

export type OperationMode = 'self_consumption' | 'autonomous'

/** Tesla Fleet API client. Every call carries a fresh token and retries once after a 401. */
export class FleetClient implements TeslaClient {
  constructor(
    private readonly http: Http,
    private readonly config: TeslaAppConfig,
    private readonly tokens: TokenManager,
  ) {}

  async energySites(): Promise<EnergySite[]> {
    const products = await this.get<Product[]>('/api/1/products')
    return products.filter((p): p is EnergySite => typeof p.energy_site_id === 'number')
  }

  siteInfo(siteId: number): Promise<SiteInfo> {
    return this.get(`/api/1/energy_sites/${siteId}/site_info`)
  }

  liveStatus(siteId: number): Promise<LiveStatus> {
    return this.get(`/api/1/energy_sites/${siteId}/live_status`)
  }

  async setTariff(siteId: number, tariff: unknown): Promise<void> {
    await this.post(`/api/1/energy_sites/${siteId}/time_of_use_settings`, { tou_settings: { tariff_content_v2: tariff } })
  }

  async setOperationMode(siteId: number, mode: OperationMode): Promise<void> {
    await this.post(`/api/1/energy_sites/${siteId}/operation`, { default_real_mode: mode })
  }

  async allowGridCharging(siteId: number): Promise<void> {
    await this.post(`/api/1/energy_sites/${siteId}/grid_import_export`, {
      disallow_charge_from_grid_with_solar_installed: false,
    })
  }

  private get<T>(path: string): Promise<T> {
    return this.call<T>({ method: 'GET', url: this.config.apiBase + path })
  }

  private post<T>(path: string, json: unknown): Promise<T> {
    return this.call<T>({ method: 'POST', url: this.config.apiBase + path, json })
  }

  private async call<T>(req: HttpRequest): Promise<T> {
    let token = await this.tokens.getAccessToken()
    let res = await this.http(withAuth(req, token))
    if (res.status === 401) {
      token = await this.tokens.forceRefresh()
      res = await this.http(withAuth(req, token))
    }
    if (res.status < 200 || res.status >= 300) throw new TeslaApiError(res.status, res.data, req.url)
    return (res.data as { response: T }).response
  }
}

function withAuth(req: HttpRequest, token: string): HttpRequest {
  return { ...req, headers: { ...req.headers, Authorization: `Bearer ${token}` } }
}
