/**
 * The parts of Tesla's energy responses the app uses. Tesla returns more fields
 * than this; the full shapes are dumped by scripts/check_site.py.
 */

export interface Product {
  energy_site_id?: number
  site_name?: string
  resource_type?: string
  [key: string]: unknown
}

export interface EnergySite extends Product {
  energy_site_id: number
}

export interface SiteInfo {
  id?: string
  site_name?: string
  default_real_mode?: 'self_consumption' | 'autonomous' | 'backup' | string
  backup_reserve_percent?: number
  components?: {
    disallow_charge_from_grid_with_solar_installed?: boolean
    [key: string]: unknown
  }
  tariff_content_v2?: unknown
  [key: string]: unknown
}

export interface LiveStatus {
  percentage_charged?: number
  solar_power?: number
  battery_power?: number
  load_power?: number
  grid_power?: number
  timestamp?: string
  [key: string]: unknown
}
