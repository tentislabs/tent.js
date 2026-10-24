import { lengthOf, isWritten, projectZone } from '../core/internal.ts'
import type { Description } from '../core/internal.ts'
import type { Tx } from '../data/index.ts'
import type { Held } from './held.ts'
import { nextTime } from './nextTime.ts'
import { readSchedule, writeSchedule } from './rows.ts'

/** The zone that the schedules of a project are read in. */
const zoneOf = (description: Description): string => projectZone(description.project)

/** The timed triggers of a version: each by its flow and its place in the flow's `on`. */
function timedOf(
  description: Description,
): Map<string, { flow: string; trigger: string; stored: Record<string, unknown> }> {
  const timed = new Map<string, { flow: string; trigger: string; stored: Record<string, unknown> }>()
  for (const [flow, record] of Object.entries(description.flows))
    for (const [place, stored] of (Array.isArray(record.on) ? record.on : []).entries())
      if (isWritten(stored) && (typeof stored.every === 'string' || typeof stored.cron === 'string'))
        timed.set(`${flow}\n${place}`, { flow, trigger: String(place), stored })
  return timed
}

/**
 * Brings the schedule to the timed triggers of the live version, in one write: a trigger that is new is given its
 * next time, one that is gone loses its row, and a time that was missed stays, so that it fires once.
 */
export function syncSchedule(held: Held): void {
  if (held.live === undefined) return
  const description = held.env.description(held.live)
  const zone = zoneOf(description)
  const timed = timedOf(description)
  const now = held.env.clock.now()
  const rows = readSchedule(held.env.store)
  const writes: ((tx: Tx) => void)[] = []
  const there = new Set<string>()
  for (const row of rows) {
    const key = `${row.flow}\n${row.trigger}`
    const trigger = timed.get(key)
    there.add(key)
    if (!trigger) writes.push((tx) => writeSchedule(tx, { flow: row.flow, trigger: row.trigger }, false))
    else if (row.nextAt > now) {
      // A time that lies ahead is held to the schedule as the live version writes it, which may be another one.
      const every = typeof trigger.stored.every === 'string' && lengthOf(trigger.stored.every)
      const nextAt = nextTime(trigger.stored, zone, now)
      if (nextAt !== undefined && nextAt !== row.nextAt && !(every && row.nextAt <= nextAt))
        writes.push((tx) => writeSchedule(tx, { flow: row.flow, trigger: row.trigger, nextAt }, false))
    }
  }
  for (const [key, trigger] of timed) {
    if (there.has(key)) continue
    const nextAt = nextTime(trigger.stored, zone, now)
    if (nextAt !== undefined)
      writes.push((tx) => writeSchedule(tx, { flow: trigger.flow, trigger: trigger.trigger, nextAt }, true))
  }
  if (writes.length)
    held.env.store.write((tx) => {
      for (const write of writes) write(tx)
    })
}

/**
 * Fires each timed trigger whose time has come: once, also where several of its times were missed. Its run is
 * added and its next time written in one write. `add` adds the run of a flow, with the moment it was due.
 */
export function fireDue(held: Held, add: (tx: Tx, flow: string, at: number) => void): void {
  if (held.live === undefined) return
  const now = held.env.clock.now()
  const due = readSchedule(held.env.store).filter((row) => row.nextAt <= now)
  if (!due.length) return
  const description = held.env.description(held.live)
  const timed = timedOf(description)
  for (const row of due) {
    const trigger = timed.get(`${row.flow}\n${row.trigger}`)
    held.env.store.write((tx) => {
      const nextAt = trigger ? nextTime(trigger.stored, zoneOf(description), now, row.nextAt) : undefined
      if (trigger) add(tx, row.flow, row.nextAt)
      writeSchedule(tx, { flow: row.flow, trigger: row.trigger, ...(nextAt === undefined ? {} : { nextAt }) }, false)
    })
  }
}

/**
 * The times of the schedule of a flow of the live version between two moments, both of them taken, in their
 * order: each time of each timed trigger of the flow, once. None for a flow that has no timed trigger.
 */
export function timesOf(held: Held, flow: string, from: number, to: number): number[] {
  if (held.live === undefined) return []
  const description = held.env.description(held.live)
  const zone = zoneOf(description)
  const times = new Set<number>()
  for (const trigger of timedOf(description).values()) {
    if (trigger.flow !== flow) continue
    // Each time is the next one after the time before, from the moment just before `from`.
    let at = nextTime(trigger.stored, zone, from - 1)
    while (at !== undefined && at <= to) {
      times.add(at)
      const next: number | undefined = nextTime(trigger.stored, zone, at, at)
      at = next !== undefined && next > at ? next : undefined
    }
  }
  return [...times].sort((a, b) => a - b)
}
