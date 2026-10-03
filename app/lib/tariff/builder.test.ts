import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildTariff, slotToClock, type TouPeriod } from './builder'

const base = JSON.parse(
  readFileSync(new URL('./__fixtures__/tariff_content_v2.json', import.meta.url), 'utf8'),
) as Record<string, any>

const build = (slots: number[]) => buildTariff({ slots, base }) as Record<string, any>

/** Expands tou_periods into 7 x 48 slots, counting how many periods claim each slot. */
function expand(tariff: Record<string, any>) {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 48 }, () => ({ cheap: 0, expensive: 0 })))
  for (const [name, { periods }] of Object.entries<{ periods: TouPeriod[] }>(tariff.seasons.Summer.tou_periods)) {
    for (const p of periods) {
      const from = (p.fromHour * 60 + p.fromMinute) / 30
      const to = ((p.toHour * 60 + p.toMinute) / 30) || 48
      expect(to).toBeGreaterThan(from)
      for (let dow = p.fromDayOfWeek; dow <= p.toDayOfWeek; dow++) {
        for (let slot = from; slot < to; slot++) {
          grid[dow]![slot]![name === 'SUPER_OFF_PEAK' ? 'cheap' : 'expensive']++
        }
      }
    }
  }
  return grid
}

describe('slotToClock', () => {
  it('converts boundaries, writing midnight as 0:00', () => {
    expect(slotToClock(0)).toEqual({ hour: 0, minute: 0 })
    expect(slotToClock(3)).toEqual({ hour: 1, minute: 30 })
    expect(slotToClock(47)).toEqual({ hour: 23, minute: 30 })
    expect(slotToClock(48)).toEqual({ hour: 0, minute: 0 })
  })
})

describe('buildTariff', () => {
  it('keeps the base tariff identity and replaces only seasons and rates', () => {
    const t = build([2, 3])
    expect(t.name).toBe(base.name)
    expect(t.utility).toBe(base.utility)
    expect(t.daily_charges).toEqual(base.daily_charges)
    expect(t.demand_charges).toEqual(base.demand_charges)
    expect(t.version).toBe(base.version)
    expect(Object.keys(t.seasons)).toEqual(['Summer', 'Winter'])
    expect(t.seasons.Summer).toMatchObject({ fromDay: 1, toDay: 31, fromMonth: 1, toMonth: 12 })
  })

  it('accepts a base wrapped in a Proxy, like Vue reactive state', () => {
    const wrap = <T extends object>(o: T): T =>
      new Proxy(o, { get: (target, key) => {
        const v = Reflect.get(target, key)
        return typeof v === 'object' && v !== null ? wrap(v) : v
      } })
    const t = buildTariff({ slots: [2, 3], base: wrap(base) }) as Record<string, any>
    expect(t).toEqual(build([2, 3]))
  })

  it('does not modify the base tariff', () => {
    const before = JSON.stringify(base)
    build([0, 1, 46, 47])
    expect(JSON.stringify(base)).toBe(before)
  })

  it('writes one cheap period for a run of selected slots, with the rest expensive', () => {
    const t = build([2, 3, 4]) // 01:00-02:30
    const day = { fromDayOfWeek: 0, toDayOfWeek: 6 }
    expect(t.seasons.Summer.tou_periods.SUPER_OFF_PEAK.periods).toEqual([
      { ...day, fromHour: 1, fromMinute: 0, toHour: 2, toMinute: 30 },
    ])
    expect(t.seasons.Summer.tou_periods.ON_PEAK.periods).toEqual([
      { ...day, fromHour: 0, fromMinute: 0, toHour: 1, toMinute: 0 },
      { ...day, fromHour: 2, fromMinute: 30, toHour: 0, toMinute: 0 },
    ])
  })

  it('repeats the same pattern on every day of the week', () => {
    const grid = expand(build([10, 11, 30]))
    for (const day of grid) {
      expect(day.map((s, i) => (s.cheap ? i : -1)).filter(i => i >= 0)).toEqual([10, 11, 30])
    }
  })

  it('covers every half hour of the week exactly once', () => {
    const grid = expand(build([0, 5, 6, 40, 47]))
    for (const day of grid) {
      for (const slot of day) expect(slot.cheap + slot.expensive).toBe(1)
    }
  })

  it('handles the midnight edges', () => {
    const t = build([0, 47])
    const day = { fromDayOfWeek: 0, toDayOfWeek: 6 }
    expect(t.seasons.Summer.tou_periods.SUPER_OFF_PEAK.periods).toEqual([
      { ...day, fromHour: 0, fromMinute: 0, toHour: 0, toMinute: 30 },
      { ...day, fromHour: 23, fromMinute: 30, toHour: 0, toMinute: 0 },
    ])
  })

  it('accepts unsorted slots and duplicates', () => {
    expect(build([5, 3, 4, 3])).toEqual(build([3, 4, 5]))
  })

  it('writes a single all-day expensive period when nothing is selected', () => {
    const t = build([])
    expect(t.seasons.Summer.tou_periods.SUPER_OFF_PEAK).toBeUndefined()
    expect(t.seasons.Summer.tou_periods.ON_PEAK.periods).toEqual([
      { fromDayOfWeek: 0, toDayOfWeek: 6, fromHour: 0, fromMinute: 0, toHour: 0, toMinute: 0 },
    ])
  })

  it('writes a single all-day cheap period when every slot is selected', () => {
    const t = build(Array.from({ length: 48 }, (_, i) => i))
    expect(t.seasons.Summer.tou_periods.ON_PEAK).toBeUndefined()
    expect(t.seasons.Summer.tou_periods.SUPER_OFF_PEAK.periods).toEqual([
      { fromDayOfWeek: 0, toDayOfWeek: 6, fromHour: 0, fromMinute: 0, toHour: 0, toMinute: 0 },
    ])
  })

  it('buys at 0p when selected and 99p otherwise, and sells at 12p throughout', () => {
    const t = build([2])
    expect(t.energy_charges.Summer.rates).toEqual({ ON_PEAK: 0.99, SUPER_OFF_PEAK: 0 })
    expect(t.sell_tariff.energy_charges.Summer.rates).toEqual({ ON_PEAK: 0.12, SUPER_OFF_PEAK: 0.12 })
    expect(t.sell_tariff.seasons).toEqual(t.seasons)
    expect(t.sell_tariff.name).toBe(base.sell_tariff.name)
  })

  it('rejects invalid slots', () => {
    expect(() => build([48])).toThrow(/Invalid slot 48/)
    expect(() => build([-1])).toThrow(/Invalid slot -1/)
    expect(() => build([1.5])).toThrow(/Invalid slot 1.5/)
  })
})
