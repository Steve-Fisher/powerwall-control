<template>
  <section v-if="status === 'loading'" class="card">
    <p>Loading&hellip;</p>
  </section>

  <section v-else-if="status !== 'signedIn'" class="card">
    <h2>Sign in</h2>
    <p>Sign in with your Tesla account and approve access to your energy products.</p>
    <p v-if="authError" class="error">{{ authError }}</p>
    <button class="primary" :disabled="status === 'signingIn'" @click="signIn">
      {{ status === 'signingIn' ? 'Waiting for Tesla…' : 'Sign in with Tesla' }}
    </button>
  </section>

  <template v-else>
    <section class="card">
      <div class="row">
        <h2>{{ siteInfo?.site_name ?? 'Your Powerwall' }}</h2>
        <button :disabled="loading" @click="refresh">{{ loading ? 'Refreshing…' : 'Refresh' }}</button>
      </div>
      <p v-if="siteError" class="error">{{ siteError }}</p>

      <dl v-if="siteInfo || liveStatus" class="facts">
        <dt>Battery</dt>
        <dd>{{ liveStatus?.percentage_charged !== undefined ? `${liveStatus.percentage_charged.toFixed(0)}%` : '—' }}</dd>
        <dt>Mode</dt>
        <dd>{{ modeLabel }}</dd>
        <dt>Grid charging</dt>
        <dd>{{ gridChargingLabel }}</dd>
        <dt>Backup reserve</dt>
        <dd>{{ siteInfo?.backup_reserve_percent !== undefined ? `${siteInfo.backup_reserve_percent}%` : '—' }}</dd>
        <dt>Tariff backup</dt>
        <dd>{{ hasBackup ? 'Saved' : 'Not yet' }}</dd>
      </dl>
    </section>

    <p class="muted">Slot planning arrives in a later step.</p>
    <button class="link" @click="signOutAndForget">Sign out</button>
  </template>
</template>

<script setup lang="ts">
const { status, error: authError, signIn, signOut } = useTeslaAuth()
const { siteInfo, liveStatus, hasBackup, loading, error: siteError, refresh, forget } = useEnergySite()

const modeLabel = computed(() => {
  const mode = siteInfo.value?.default_real_mode
  switch (mode) {
    case 'autonomous': return 'Time-Based Control'
    case 'self_consumption': return 'Self-Powered'
    case 'backup': return 'Backup only'
    case undefined: return '—'
    default: return mode
  }
})

const gridChargingLabel = computed(() => {
  const disallowed = siteInfo.value?.components?.disallow_charge_from_grid_with_solar_installed
  return disallowed === undefined ? '—' : disallowed ? 'Not allowed' : 'Allowed'
})

watch(status, (s) => { if (s === 'signedIn') refresh() }, { immediate: true })

async function signOutAndForget() {
  await forget()
  await signOut()
}
</script>
