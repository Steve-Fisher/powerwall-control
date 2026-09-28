// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',

  // Pure client-side SPA: `nuxt generate` emits static files that Capacitor wraps.
  ssr: false,

  devtools: { enabled: false },

  app: {
    head: {
      title: 'Powerwall Control',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'color-scheme', content: 'light dark' },
      ],
    },
  },

  css: ['~/assets/main.css'],

  // Filled from NUXT_PUBLIC_* in .env at generate time and baked into the APK.
  runtimeConfig: {
    public: {
      teslaClientId: '',
      teslaClientSecret: '',
      teslaRedirectUri: 'https://powerwall.versible.co.uk/auth/callback',
      teslaApiBase: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
    },
  },
})
