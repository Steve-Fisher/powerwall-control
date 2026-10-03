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

    <section class="card">
      <div class="choice" role="group" aria-label="Powerwall mode">
        <button :class="{ active: choice === 'self' }" :aria-pressed="choice === 'self'" @click="pick('self')">Self Powered</button>
        <button :class="{ active: choice === 'timed' }" :aria-pressed="choice === 'timed'" @click="pick('timed')">Timed Charge</button>
      </div>

      <template v-if="choice === 'timed'">
        <p class="muted">Tap the half hours to charge from the grid. The same pattern repeats every day.</p>
        <div class="slots">
          <button
            v-for="slot in SLOTS_PER_DAY"
            :key="slot"
            :class="{ selected: slots.includes(slot - 1) }"
            :aria-pressed="slots.includes(slot - 1)"
            @click="toggle(slot - 1)"
          >
            {{ slotLabel(slot - 1) }}
          </button>
        </div>
      </template>
      <p v-else class="muted">The Powerwall runs on solar and battery as normal. Tap Set to switch back.</p>

      <button class="primary set" :disabled="applying || siteId === null" @click="set">
        {{ applying ? 'Setting…' : 'Set' }}
      </button>

      <ol v-if="steps.length" class="steps">
        <li v-for="step in steps" :key="step.label" :class="step.state">
          {{ stepIcon(step.state) }} {{ step.label }}
          <span v-if="step.error" class="error"> — {{ step.error }}</span>
        </li>
      </ol>
    </section>

    <button class="link" @click="signOutAndForget">Sign out</button>
  </template>
</template>

<script setup lang="ts">
import { SLOTS_PER_DAY } from '~/lib/tariff/builder'
import type { StepState } from '~/composables/usePlan'

const { status, error: authError, signIn, signOut } = useTeslaAuth()
const { siteId, siteInfo, liveStatus, hasBackup, loading, error: siteError, refresh, forget } = useEnergySite()
const { slots, steps, applying, loadSlots, toggle, setSelfPowered, setTimedCharge } = usePlan()

// Starts on whichever mode the Powerwall is in, until the user picks one.
const choice = ref<'self' | 'timed'>('self')
let picked = false
watch(() => siteInfo.value?.default_real_mode, (mode) => {
  if (!picked) choice.value = mode === 'autonomous' ? 'timed' : 'self'
}, { immediate: true })

function pick(value: 'self' | 'timed') {
  picked = true
  choice.value = value
}

function set() {
  return choice.value === 'timed' ? setTimedCharge() : setSelfPowered()
}

function slotLabel(slot: number) {
  return `${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`
}

const stepIcons: Record<StepState, string> = { pending: '○', running: '…', done: '✓', error: '✗' }
const stepIcon = (state: StepState) => stepIcons[state]

onMounted(loadSlots)

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

<style scoped>
.choice { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.choice button { padding: 12px; }
.choice button.active { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
.slots { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 12px 0; }
.slots button { padding: 10px 0; font-variant-numeric: tabular-nums; }
.slots button.selected { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
.set { margin-top: 4px; }
.steps { list-style: none; padding: 0; margin: 12px 0 0; }
.steps li.pending { color: var(--muted); }
</style>
