/**
 * Builds the `tariff_content_v2` that makes the Powerwall grid-charge in chosen half-hour slots.
 *
 * One daily pattern repeats every day of the week: selected slots buy at `cheap`, all others at
 * `expensive`, and every slot sells at `sell`. Prices are in pounds per kWh, as in Tesla's tariffs.
 *
 * Format assumptions NOT confirmed by the real fixture (it has one all-week period pair and no
 * minutes). They are isolated below so the first real upload can adjust them:
 *  - `fromMinute` / `toMinute` are honoured for half-hour boundaries
 *  - a period that ends at midnight is written as `toHour: 0, toMinute: 0` (see `slotToClock`),
 *    and a whole day as 0:00 to 0:00
 */

export const SLOTS_PER_DAY = 48

const CHEAP = 'SUPER_OFF_PEAK'
const EXPENSIVE = 'ON_PEAK'
type PeriodName = typeof CHEAP | typeof EXPENSIVE

export interface TariffPrices {
  /** Buy price in selected slots (the Powerwall should charge). */
  cheap: number
  /** Buy price everywhere else (the Powerwall should avoid importing). */
  expensive: number
  /** Sell price in every slot. */
  sell: number
}

/** Selected slots buy at 0p, the rest at 99p, and everything sells at 12p. */
export const DEFAULT_PRICES: TariffPrices = { cheap: 0, expensive: 0.99, sell: 0.12 }

export interface TouPeriod {
  fromDayOfWeek: number
  toDayOfWeek: number
  fromHour: number
  fromMinute: number
  toHour: number
  toMinute: number
}

type Obj = Record<string, unknown>

export interface BuildTariffOptions {
  /** Half-hour slot indexes 0..47 (0 = 00:00-00:30, 47 = 23:30-00:00). Order and duplicates don't matter. */
  slots: readonly number[]
  /** An existing tariff to keep the name, utility, charges and version from (e.g. the saved backup). */
  base: Obj
  prices?: TariffPrices
}

/** Clock time for a slot boundary (0..48). Boundary 48 is midnight and is written as 0:00. */
export function slotToClock(boundary: number): { hour: number; minute: number } {
  return { hour: Math.floor(boundary / 2) % 24, minute: (boundary % 2) * 30 }
}

export function buildTariff({ slots, base, prices = DEFAULT_PRICES }: BuildTariffOptions): Obj {
  const touPeriods = buildTouPeriods(selectedSlots(slots))
  const seasons = {
    Summer: { fromDay: 1, toDay: 31, fromMonth: 1, toMonth: 12, tou_periods: touPeriods },
    Winter: {},
  }
  const rates = (cheap: number, expensive: number) => ({
    ALL: { rates: { ALL: 0 } },
    Summer: { rates: { [EXPENSIVE]: expensive, [CHEAP]: cheap } },
    Winter: {},
  })

  const result = clone(base)
  result.seasons = seasons
  result.energy_charges = rates(prices.cheap, prices.expensive)
  const sell = isObject(base.sell_tariff) ? clone(base.sell_tariff) : clone(base)
  delete sell.sell_tariff
  sell.seasons = clone(seasons)
  sell.energy_charges = rates(prices.sell, prices.sell)
  result.sell_tariff = sell
  return result
}

function selectedSlots(slots: readonly number[]): boolean[] {
  const flags = new Array<boolean>(SLOTS_PER_DAY).fill(false)
  for (const slot of slots) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS_PER_DAY) {
      throw new Error(`Invalid slot ${slot}: expected an integer from 0 to ${SLOTS_PER_DAY - 1}`)
    }
    flags[slot] = true
  }
  return flags
}

/** Splits the day into consecutive runs of selected or unselected slots. `to` is exclusive (48 = midnight). */
function buildTouPeriods(selected: readonly boolean[]) {
  const result: Partial<Record<PeriodName, { periods: TouPeriod[] }>> = {}
  let from = 0
  for (let i = 1; i <= SLOTS_PER_DAY; i++) {
    if (i < SLOTS_PER_DAY && selected[i] === selected[from]) continue
    const start = slotToClock(from)
    const end = slotToClock(i)
    const name = selected[from] ? CHEAP : EXPENSIVE
    ;(result[name] ??= { periods: [] }).periods.push({
      fromDayOfWeek: 0,
      toDayOfWeek: 6,
      fromHour: start.hour,
      fromMinute: start.minute,
      toHour: end.hour,
      toMinute: end.minute,
    })
    from = i
  }
  return result
}

/**
 * Deep copy via JSON. `structuredClone` throws on Vue reactive proxies, which is what the app
 * passes in, and a tariff is plain JSON anyway.
 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isObject(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
