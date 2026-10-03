import { Preferences } from '@capacitor/preferences'
import { SLOTS_PER_DAY, buildTariff } from '~/lib/tariff/builder'
import { SignedOutError } from '~/lib/tesla/oauth'

const SLOTS_KEY = 'plan.slots'

export type StepState = 'pending' | 'running' | 'done' | 'error'

export interface Step {
  label: string
  state: StepState
  error?: string
}

/** The daily charging plan: which half-hour slots to charge in, and applying it to the Powerwall. */
export function usePlan() {
  const { client } = useTeslaAuth()
  const { siteId, siteInfo, refresh } = useEnergySite()
  const slots = useState<number[]>('plan.slots', () => [])
  const steps = useState<Step[]>('plan.steps', () => [])
  const applying = useState('plan.applying', () => false)

  async function loadSlots() {
    const { value } = await Preferences.get({ key: SLOTS_KEY })
    if (!value) return
    const saved = JSON.parse(value) as unknown
    if (Array.isArray(saved)) {
      slots.value = saved.filter((s): s is number => Number.isInteger(s) && s >= 0 && s < SLOTS_PER_DAY)
    }
  }

  function toggle(slot: number) {
    slots.value = slots.value.includes(slot)
      ? slots.value.filter(s => s !== slot)
      : [...slots.value, slot].sort((a, b) => a - b)
  }

  function requireSiteId(): number {
    if (siteId.value === null) throw new Error('No Powerwall loaded yet. Tap Refresh and try again.')
    return siteId.value
  }

  /** Runs the steps in order and stops at the first failure, leaving later steps pending. */
  async function run(plan: { label: string, action: () => Promise<void> }[]) {
    applying.value = true
    steps.value = plan.map(p => ({ label: p.label, state: 'pending' }))
    try {
      for (const [i, step] of plan.entries()) {
        steps.value[i]!.state = 'running'
        try {
          await step.action()
          steps.value[i]!.state = 'done'
        }
        catch (err) {
          steps.value[i]!.state = 'error'
          // Sign-out is reported by useTeslaAuth; don't show it twice.
          if (!(err instanceof SignedOutError)) steps.value[i]!.error = (err as Error).message
          return false
        }
      }
      return true
    }
    finally {
      applying.value = false
      await refresh()
    }
  }

  function setSelfPowered() {
    return run([
      { label: 'Set Self-Powered mode', action: () => client.setOperationMode(requireSiteId(), 'self_consumption') },
    ])
  }

  async function setTimedCharge() {
    const chosen = [...slots.value]
    const ok = await run([
      {
        label: 'Upload tariff',
        action: async () => {
          const base = siteInfo.value?.tariff_content_v2
          if (typeof base !== 'object' || base === null) throw new Error('The current tariff has not loaded. Tap Refresh and try again.')
          await client.setTariff(requireSiteId(), buildTariff({ slots: chosen, base: base as Record<string, unknown> }))
        },
      },
      { label: 'Set Time-Based Control', action: () => client.setOperationMode(requireSiteId(), 'autonomous') },
      { label: 'Allow grid charging', action: () => client.allowGridCharging(requireSiteId()) },
    ])
    if (ok) await Preferences.set({ key: SLOTS_KEY, value: JSON.stringify(chosen) })
    return ok
  }

  return { slots, steps, applying, loadSlots, toggle, setSelfPowered, setTimedCharge }
}
