import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'

/**
 * Restores the sign-in state and listens for the OAuth redirect, which reaches
 * the app as a deep link (https App Link or the custom-scheme fallback).
 */
export default defineNuxtPlugin(async () => {
  const auth = useTeslaAuth()
  await auth.init()

  if (!Capacitor.isNativePlatform()) return

  await App.addListener('appUrlOpen', ({ url }) => auth.handleRedirect(url))
  await Browser.addListener('browserFinished', () => auth.cancelSignIn())

  // Cold start: the app was launched by the redirect itself.
  const launch = await App.getLaunchUrl()
  if (launch?.url) await auth.handleRedirect(launch.url)
})
