import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Tx } from '../../data/index.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { table as countingTable } from '../tables/counting.ts'
import { table as filesTable } from '../tables/files.ts'
import type { Gathered } from './gather.ts'
import { gather, levelsOf } from './gather.ts'

const system = { kind: 'system' } as const

/** One level as `_t_counting` keeps it under `level`: the size, and the moment up to which its byte-seconds are booked. */
interface Kept {
  size: number
  at: number
}

/** A level while the app is open: its size now, since when it stood so, and its byte-seconds not booked yet. */
interface Standing {
  size: number
  since: number
  seconds: number
  peak: number
}

/** The two levels of an app: its files and its data, and the timer of their next measure. */
interface Levels {
  files: Standing
  data: Standing
  timer?: () => void
}

const held = new WeakMap<Opened, Levels>()

/** How many bytes the data of an app takes: its data file and the files of its tenants, which do not shrink by themselves. */
function dataSize(o: Opened): number {
  let size = 0
  for (const name of ['data.db', 'data.db-wal']) {
    const file = join(o.dataFolder, name)
    if (existsSync(file)) size += statSync(file).size
  }
  const root = join(o.dataFolder, 'tenants')
  if (existsSync(root))
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true }))
      if (entry.isFile()) size += statSync(join(entry.parentPath, entry.name)).size
  return size
}

/** How many bytes the files of an app hold, by the rows of `_t_files`. */
function filesSize(o: Opened): number {
  const rows: unknown = o.store.read({ from: filesTable.name }, system).value
  return (Array.isArray(rows) ? rows : []).reduce((all, row) => all + Number(Reflect.get(Object(row), 'size') ?? 0), 0)
}

/** The levels that `_t_counting` holds of an app, where it holds them. */
function keptOf(o: Opened): { files?: Kept; data?: Kept } {
  const row: unknown = o.store.read({ from: countingTable.name, one: 'get', id: 'level' }, system).value
  const value: unknown = Reflect.get(Object(row), 'value')
  const of = (part: unknown): Kept | undefined => {
    const size: unknown = Reflect.get(Object(part), 'size')
    const at: unknown = Reflect.get(Object(part), 'at')
    return typeof size === 'number' && typeof at === 'number' ? { size, at } : undefined
  }
  const files = of(Reflect.get(Object(value), 'files'))
  const data = of(Reflect.get(Object(value), 'data'))
  return { ...(files ? { files } : {}), ...(data ? { data } : {}) }
}

/** Adds what a level stood since it was last moved to its byte-seconds that are not booked yet. */
function stood(level: Standing, now: number): void {
  level.seconds += (level.size * Math.max(0, now - level.since)) / 1000
  level.since = now
}

/** Measures the data and the files of an app anew: what they stood up to now is added, and their sizes are read. */
function measure(o: Opened, levels: Levels): void {
  const now = o.clock.now()
  stood(levels.data, now)
  stood(levels.files, now)
  levels.data.size = dataSize(o)
  levels.files.size = filesSize(o)
  levels.data.peak = Math.max(levels.data.peak, levels.data.size)
  gather(o, 'data', { dataBytesPeak: levels.data.size }, { peak: true })
}

/**
 * Takes an app that writes its counts now, and its open write. Answers the byte-seconds that its levels stood up to
 * now, and writes into `_t_counting` the moment up to which they are booked, in the write that books them: so a span
 * is booked once, also where the program is killed after it.
 */
function due(o: Opened, tx: Tx): Gathered[] {
  const levels = held.get(o)
  if (!levels) return []
  const now = o.clock.now()
  const amounts: Gathered[] = []
  for (const [name, level, unit] of [
    ['files', levels.files, 'fileByteSeconds'],
    ['data', levels.data, 'dataByteSeconds'],
  ] as const) {
    stood(level, now)
    if (level.seconds > 0) amounts.push({ name, answeredBy: '', caller: '', unit, amount: level.seconds })
    level.seconds = 0
  }
  const value = { files: { size: levels.files.size, at: now }, data: { size: levels.data.size, at: now } }
  const there: unknown = tx.read({ from: countingTable.name, one: 'get', id: 'level' }, system)
  if (there) tx.change(countingTable.name, 'level', { value }, system)
  else tx.add(countingTable.name, { key: 'level', value }, system)
  return amounts
}

/**
 * Starts the levels of an app that opens as the writer of its data. What stood while it was closed is added at
 * once, from the moment that `_t_counting` holds, and booked with the next write of the counts to the day it is
 * written: a span below zero as none. The data is measured every `levelEvery` and when the app closes or falls
 * asleep, before what was counted is written.
 */
export function keepLevels(o: Opened): void {
  const now = o.clock.now()
  const kept = keptOf(o)
  const levels: Levels = {
    files: { size: kept.files?.size ?? 0, since: kept.files?.at ?? now, seconds: 0, peak: 0 },
    data: { size: kept.data?.size ?? 0, since: kept.data?.at ?? now, seconds: 0, peak: 0 },
  }
  held.set(o, levels)
  // The span of a closed app is taken from the clock of the app, which is the wall clock outside a test.
  measure(o, levels)
  levels.files.peak = levels.files.size
  gather(o, 'files', { fileBytesPeak: levels.files.size }, { peak: true })
  const every = o.counting?.levelEvery ?? storedLimit(o.description, 'levelEvery')
  const next = (): void => {
    levels.timer = o.clock.setTimer(o.clock.now() + every, () => {
      measure(o, levels)
      next()
    })
  }
  next()
  levelsOf(o, {
    due: (tx) => due(o, tx),
    close() {
      levels.timer?.()
      levels.timer = undefined
      measure(o, levels)
    },
    stop() {
      levels.timer?.()
      levels.timer = undefined
    },
  })
}

/** Moves the running sum of the files of an app by what an upload added or a removal took away. */
export function filesMoved(o: Opened, bytes: number): void {
  const levels = held.get(o)
  if (!levels) return
  stood(levels.files, o.clock.now())
  levels.files.size = Math.max(0, levels.files.size + bytes)
  if (levels.files.size > levels.files.peak) {
    levels.files.peak = levels.files.size
    gather(o, 'files', { fileBytesPeak: levels.files.size }, { peak: true })
  }
}
