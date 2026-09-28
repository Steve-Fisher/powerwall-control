export const AUTHORIZE_URL = 'https://auth.tesla.com/oauth2/v3/authorize'
export const TOKEN_URL = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token'
export const SCOPES = ['openid', 'offline_access', 'energy_device_data', 'energy_cmds'].join(' ')

export interface TeslaAppConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  apiBase: string
}
