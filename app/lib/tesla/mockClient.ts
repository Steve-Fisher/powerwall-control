import type { OperationMode, TeslaClient } from './client'
import type { EnergySite, LiveStatus, SiteInfo } from './types'

const SITE_ID = 1234567890

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Canned responses for `npm run dev` in a desktop browser, where the real API is blocked by CORS. */
export class MockTeslaClient implements TeslaClient {
  private mode: OperationMode = 'autonomous'
  private tariff: unknown = { name: 'Mock tariff' }
  private gridChargingDisallowed = false

  async energySites(): Promise<EnergySite[]> {
    await delay(300)
    return [{ energy_site_id: SITE_ID, site_name: 'Home (mock)', resource_type: 'battery' }]
  }

  async siteInfo(): Promise<SiteInfo> {
    await delay(300)
    return {
      site_name: 'Home (mock)',
      default_real_mode: this.mode,
      backup_reserve_percent: 20,
      components: { disallow_charge_from_grid_with_solar_installed: this.gridChargingDisallowed },
      tariff_content_v2: this.tariff,
    }
  }

  async setTariff(_siteId: number, tariff: unknown): Promise<void> {
    await delay(400)
    this.tariff = tariff
  }

  async setOperationMode(_siteId: number, mode: OperationMode): Promise<void> {
    await delay(400)
    this.mode = mode
  }

  async allowGridCharging(): Promise<void> {
    await delay(400)
    this.gridChargingDisallowed = false
  }

  async liveStatus(): Promise<LiveStatus> {
    await delay(200)
    return {
      percentage_charged: 40 + Math.round(Math.random() * 40),
      solar_power: 1200,
      battery_power: -800,
      load_power: 400,
      grid_power: 0,
      timestamp: new Date().toISOString(),
    }
  }
}
