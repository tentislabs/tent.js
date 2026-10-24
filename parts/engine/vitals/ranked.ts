import type { Opened } from '../opened.ts'
import { measures } from './measures.ts'

/** One measure of a screen in one version: its 75th share, the line of good, how many it is of, and the version before. */
interface Measured {
  p75: number
  good: number
  count: number
  before?: number
}

/** A screen in one version, with each of its measures, the version before it, and how far past the line it stands. */
export interface Ranked {
  screen: string
  version: string
  before?: string
  measures: Record<string, Measured>
  // The most that one of its measures stands past its line of good, as a share of the line: 1 is on the line.
  past: number
}

const day = 86_400_000

/** The 75th share of some numbers: the smallest that three quarters of them do not pass. */
function p75(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.75) - 1)] ?? 0
}

/**
 * Takes an app. Answers, for each screen and version that its visitors measured over the last day, the 75th share
 * of each measure against the line of good for it, beside the same of the version before, which is the version
 * of that screen whose measures came first before it: the screens furthest past their line first.
 */
export function rankedVitals(o: Opened): Ranked[] {
  const rows = o.log.rows('vitals', { since: o.clock.now() - day })
  const held = new Map<string, { screen: string; version: string; first: number; values: Map<string, number[]> }>()
  for (const row of rows) {
    const screen = String(row.screen)
    const version = String(row.version)
    const key = `${screen}\n${version}`
    const one = held.get(key) ?? { screen, version, first: Number(row.at), values: new Map<string, number[]>() }
    held.set(key, one)
    const measure = String(row.measure)
    one.values.set(measure, [...(one.values.get(measure) ?? []), Number(row.value)])
  }
  const all = [...held.values()]
  const ranked = all.map((one): Ranked => {
    const earlier = all
      .filter((other) => other.screen === one.screen && other.first < one.first)
      .toSorted((a, b) => b.first - a.first)[0]
    const shares: Record<string, Measured> = {}
    let past = 0
    for (const [measure, values] of one.values) {
      const good = measures[measure]?.good ?? 1
      const share = p75(values)
      const before = earlier?.values.get(measure)
      shares[measure] = { p75: share, good, count: values.length, ...(before ? { before: p75(before) } : {}) }
      past = Math.max(past, share / good)
    }
    return {
      screen: one.screen,
      version: one.version,
      ...(earlier ? { before: earlier.version } : {}),
      measures: shares,
      past,
    }
  })
  return ranked.toSorted((a, b) => b.past - a.past || a.screen.localeCompare(b.screen))
}
