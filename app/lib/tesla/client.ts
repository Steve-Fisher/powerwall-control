import type { TeslaAppConfig } from './config'
import { TeslaApiError, type Http, type HttpRequest } from './http'
import type { TokenManager } from './tokenManager'
import type { EnergySite, LiveStatus, Product, SiteInfo } from './types'

export interface TeslaClient {
  energySites(): Promise<EnergySite[]>
  siteInfo(siteId: number): Promise<SiteInfo>
  liveStatus(siteId: number): Promise<LiveStatus>
}

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

  private get<T>(path: string): Promise<T> {
    return this.call<T>({ method: 'GET', url: this.config.apiBase + path })
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
