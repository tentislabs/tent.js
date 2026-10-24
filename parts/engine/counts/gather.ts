import { callerText } from '../../data/index.ts'
import type { Caller } from '../../core/index.ts'
import type { Tx } from '../../data/index.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'

import type { Booked } from './book.ts'
import { book } from './book.ts'
import type { CountBy } from './by.ts'
import { countByOf } from './by.ts'
import { dayOf } from './day.ts'
import { cpuGiven } from './program.ts'

/** One amount that is gathered in memory and not written yet: a row of the counts with no day. */
export type Gathered = Omit<Booked, 'day'>

/** What an app has gathered since its last write of the counts, and the timer of the next write. */
interface Gathering {
  amounts: Map<string, Gathered>
  timer?: () => void
  // What writes what was gathered where this machine does not write: a reader hands it to its writer.
  elsewhere?: (amounts: Gathered[]) => void
  // The levels of the writer: what they stood is booked in each write of the counts, and they are measured last.
  levels?: LevelHooks
  // What brings what is counted as time goes up to now before each write: the machines that stand.
  first: (() => void)[]
}

/** What the levels of an app hand the writing of its counts. */
export interface LevelHooks {
  // Answers what the levels stood up to now, and writes in the open write the moment they are booked to.
  due(tx: Tx): Gathered[]
  // Measures the levels a last time, before the app closes.
  close(): void
  // Takes the timer of the levels back, with nothing measured: an opening that fails.
  stop(): void
}

const held = new WeakMap<Opened, Gathering>()

const gatheringOf = (o: Opened): Gathering => {
  let made = held.get(o)
  if (!made) {
    made = { amounts: new Map(), first: [] }
    held.set(o, made)
  }
  return made
}

/** How long an app gathers its counts before it writes them: what the host opened it with, or `limits.countEvery`. */
export const countEveryOf = (o: Opened): number => o.counting?.countEvery ?? storedLimit(o.description, 'countEvery')

/** What one thing that is counted says of itself: who caused it, and how it is counted. */
export interface Counted {
  // The caller that caused it, where callers are counted; and the definition whose `countBy` holds for it.
  caller?: Caller
  definition?: string
  // What answered it, for a model the model that did; and a level that holds the highest, which is never added.
  answeredBy?: string
  peak?: true
  // A thing that a limit of use rests on, which is counted also where only those are: a model and a machine.
  limits?: true
  // How it is counted where it says so itself: a model that states `countBy`, which no bundle and no host changes.
  by?: CountBy
}

/**
 * Takes an app, the name of what was used, its amounts by unit, and what it says of itself. Gathers the amounts in
 * memory, by the caller where callers are counted and with the caller empty where they are not, and leaves out
 * everything that is no model and no machine where only those are counted. A peak and what no caller caused stand
 * with the caller empty. The first amount after a write arms the timer of the next one.
 */
export function gather(o: Opened, name: string, units: Record<string, number>, c: Counted = {}): void {
  const by = c.by ?? countByOf(o, c.definition ?? name)
  if (by === 'limits' && !c.limits) return
  const caller = by === 'caller' && c.caller && !c.peak ? c.caller : undefined
  const who = caller ? { caller: callerText(caller), ...(caller.user ? { user: caller.user.id } : {}) } : { caller: '' }
  const g = gatheringOf(o)
  for (const [unit, amount] of Object.entries(units)) {
    if (!Number.isFinite(amount) || amount === 0) continue
    const answeredBy = c.answeredBy ?? ''
    const key = [name, answeredBy, who.caller, unit].join('\n')
    const was = g.amounts.get(key)
    if (was) was.amount = c.peak ? Math.max(was.amount, amount) : was.amount + amount
    else g.amounts.set(key, { name, answeredBy, ...who, unit, amount, ...(c.peak ? { peak: true as const } : {}) })
  }
  armed(o, g)
}

/** Arms the timer of the next write of the counts, where something waits to be written and none is armed. */
function armed(o: Opened, g: Gathering): void {
  if (!g.timer && g.amounts.size)
    g.timer = o.clock.setTimer(o.clock.now() + countEveryOf(o), () => {
      g.timer = undefined
      writeCounts(o)
    })
}

/** Gathers rows of the counts that were gathered elsewhere, by what they already name: a thread's, a reader's. */
export function gatherRows(o: Opened, rows: Gathered[]): void {
  const g = gatheringOf(o)
  for (const one of rows) {
    // The processor time that a thread of this program measured is booked to an app by this program.
    if (one.unit === 'cpuMs') cpuGiven(one.amount)
    const key = [one.name, one.answeredBy, one.caller, one.unit].join('\n')
    const was = g.amounts.get(key)
    if (was) was.amount = one.peak ? Math.max(was.amount, one.amount) : was.amount + one.amount
    else g.amounts.set(key, { ...one })
  }
  armed(o, g)
}

/**
 * Writes what an app gathered, in one write, to the day in which it is written: a reader hands it to its writer.
 * What a write that failed held is gathered again, so that it is written the next time.
 */
export function writeCounts(o: Opened): void {
  const g = gatheringOf(o)
  for (const one of g.first) one()
  g.timer?.()
  g.timer = undefined
  if (!g.amounts.size) return
  const amounts = [...g.amounts.values()]
  g.amounts.clear()
  if (g.elsewhere) {
    g.elsewhere(amounts)
    return
  }
  const day = dayOf(o)
  try {
    ownWrite(o, () =>
      o.store.write((tx) =>
        book(
          o,
          tx,
          [...amounts, ...(g.levels?.due(tx) ?? [])].map((one) => ({ ...one, day })),
        ),
      ),
    )
  } catch (error) {
    // A write that the store refused, as on a reader that is not current, keeps what it held for the next one,
    // and the log says so: counts that are never written are no silent loss.
    for (const one of amounts) {
      const key = [one.name, one.answeredBy, one.caller, one.unit].join('\n')
      if (!g.amounts.has(key)) g.amounts.set(key, one)
    }
    o.log.write('lines', {
      at: o.clock.now(),
      level: 'warn',
      message: 'The counts could not be written: they are kept for the next write of the counts.',
      data: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
    })
  }
}

// The numbers of the writes that the counting itself made, of each app since it opened.
const own = new WeakMap<Opened, number[]>()

/** Carries out a write of the counting's own, and keeps its number: such a write is no use of the app. */
export function ownWrite<Answer>(o: Opened, write: () => Answer): Answer {
  const answer = write()
  const numbers = own.get(o) ?? []
  numbers.push(o.machine.at().n)
  own.set(o, numbers)
  return answer
}

/**
 * Whether an app was written since a number of its data by anything but the counting: the engine's own work is no
 * such use, and an app that falls asleep is woken for no backup by its own counts.
 */
export function writtenSince(o: Opened, from: number): boolean {
  const numbers = (own.get(o) ?? []).filter((one) => one > from)
  own.set(o, numbers)
  return o.machine.at().n - from > numbers.length
}

/** Takes back what the counting of an app started, where its opening fails: no timer of it stays on the clock. */
export function stopCounting(o: Opened): void {
  const g = gatheringOf(o)
  g.timer?.()
  g.timer = undefined
  g.amounts.clear()
  g.levels?.stop()
}

/** Names what writes the counts of an app that does not write them itself: a reader hands them to its writer. */
export function countsGoTo(o: Opened, elsewhere: ((amounts: Gathered[]) => void) | undefined): void {
  const g = gatheringOf(o)
  if (elsewhere) g.elsewhere = elsewhere
  else delete g.elsewhere
}

/** Starts the counting of an app that opens: what it gathered is written when it closes or falls asleep. */
export function keepCounting(o: Opened): void {
  o.before.push({
    close() {
      gatheringOf(o).levels?.close()
      writeCounts(o)
    },
  })
}

/** Names what brings what is counted as time goes up to now, before each write of the counts of an app. */
export function beforeWriting(o: Opened, first: () => void): void {
  gatheringOf(o).first.push(first)
}

/** The sums by unit of what an app gathered and did not write yet, of the amounts that fit: a limit counts them too. */
export function gatheredOf(o: Opened, fits: (one: Gathered) => boolean): Record<string, number> {
  const sums: Record<string, number> = {}
  for (const one of gatheringOf(o).amounts.values()) if (fits(one)) sums[one.unit] = (sums[one.unit] ?? 0) + one.amount
  return sums
}

/** Names the levels of an app, which each write of its counts books. */
export function levelsOf(o: Opened, levels: LevelHooks): void {
  gatheringOf(o).levels = levels
}
