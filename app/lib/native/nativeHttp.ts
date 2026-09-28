import { CapacitorHttp } from '@capacitor/core'
import type { Http } from '~/lib/tesla/http'

/** Native HTTP via Capacitor, so requests to Tesla aren't subject to WebView CORS. */
export const nativeHttp: Http = async (req) => {
  const headers: Record<string, string> = { Accept: 'application/json', ...req.headers }
  let data: unknown
  if (req.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    data = req.form
  }
  else if (req.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    data = req.json
  }

  const res = await CapacitorHttp.request({
    method: req.method,
    url: req.url,
    params: req.params,
    headers,
    data,
    connectTimeout: 15_000,
    readTimeout: 30_000,
  })
  return { status: res.status, data: res.data }
}
