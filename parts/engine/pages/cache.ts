import type { Touched } from '../../data/index.ts'
import type { Description } from '../../core/internal.ts'
import { isStored, sameValue, startOfState, stateEntries } from '../../core/internal.ts'
import type { Drawn, Page } from '../../screens/draw.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { tellStale } from './stale.ts'

/** One answer that the cache keeps: what was sent, and what drops it. */
interface Kept {
  until: number
  screen: string
  // The tables that its queries read, or nothing where one of them is not known: any write then drops it.
  tables: Set<string> | undefined
  status: number
  html: string
  page: Page | undefined
  size: number
  // Of an answer that left as public: where a cache outside keeps it.
  out?: Out
  // The keys of the tables it read, as its header names them.
  keys?: string[]
  // Of the shared part of a screen with personal parts: each use of a personal component, in its place.
  personal?: NonNullable<Drawn['personal']>
}

/** Where an answer that left as public is kept outside the engine: its host, its address and its language. */
export interface Out {
  host: string
  address: string
  language: string
}

// The answers that the cache of each app keeps, the oldest first, by the app over every version it runs: an answer
// is kept under its version, so what a switch drew before it is there after it.
const kept = new WeakMap<object, Map<string, Kept>>()

/**
 * The tables whose writes drop an answer that read a function: for a query written with `rows`, its `reads`, or
 * the table it reads from, and every table that a rule of one of them reaches. Nothing where they are not known:
 * any write then drops the answer.
 */
function tablesRead(description: Description, name: string): Set<string> | undefined {
  const record = Object.hasOwn(description.functions, name) ? description.functions[name] : undefined
  const plan = Object(record?.plan)
  if (record?.kind !== 'query' || typeof plan.from !== 'string') return undefined
  const found = new Set<string>()
  const left = Array.isArray(record.reads) ? record.reads.map(String) : [String(plan.from)]
  for (let table = left.pop(); table !== undefined; table = left.pop()) {
    if (found.has(table)) continue
    found.add(table)
    const stored = Object.hasOwn(description.tables, table) ? description.tables[table] : undefined
    for (const reach of Array.isArray(stored?.reaches) ? stored.reaches : []) left.push(String(reach))
  }
  return found
}

/** How long a screen is kept, and whether its answers may be kept by a cache outside the engine. */
export function cacheOf(screen: Record<string, unknown>): { for: number; public: boolean } | undefined {
  const stated = screen.cache
  if (typeof stated === 'number' && stated > 0) return { for: stated, public: false }
  if (isStored(stated) && typeof stated.for === 'number' && stated.for > 0)
    return { for: stated.for, public: stated.public === true }
  return undefined
}

/** Whether a value of a state may be part of what an answer is kept under: only one that holds few values. */
function fewValues(type: Record<string, unknown>): boolean {
  if (type.kind === 'choice' || type.kind === 'boolean') return true
  return type.kind === 'number' && type.whole === true && typeof type.min === 'number' && typeof type.max === 'number'
}

/**
 * Takes the description, the name of a screen, the version, the name and the address with its language that the
 * app was reached by, and the state that the address and the device gave. Answers what an answer is kept under,
 * or nothing where the answer is not kept: a state that is not at its default and whose type holds many values
 * would let a stranger fill the cache with made-up values. A name that is no state is no part of it.
 */
export function cacheKey(
  description: Description,
  screen: string,
  version: string,
  host: string,
  address: string,
  state: Record<string, unknown>,
  // An answer of a screen that is opened above another is kept apart from the one of that screen as a page.
  above = false,
): string | undefined {
  const entries = { ...stateEntries(description.project.state), ...stateEntries(description.screens[screen]?.state) }
  const counted: [string, unknown][] = []
  for (const [name, entry] of Object.entries(entries)) {
    if (!Object.hasOwn(state, name) || sameValue(state[name], startOfState(entry))) continue
    if (!fewValues(entry.type)) return undefined
    counted.push([name, state[name]])
  }
  counted.sort(([a], [b]) => (a < b ? -1 : 1))
  return JSON.stringify([version, host, address, counted, ...(above ? ['above'] : [])])
}

/** The answer that the cache keeps under a key, while its time lasts. */
export function cachedAt(o: Opened, key: string, now: number): Kept | undefined {
  const held = kept.get(o.handles)?.get(key)
  if (!held) return undefined
  if (held.until > now) return held
  kept.get(o.handles)?.delete(key)
  return undefined
}

/**
 * Takes an app, a key, the screen, how long it is kept, the answer, and the queries its drawing met. Keeps the
 * answer, the oldest dropped first past `pageCacheSize` and, for one screen, past `pageCachePerScreen`, so that
 * walking the values of one screen's state cannot push every other screen out.
 */
export function keepAt(
  o: Opened,
  key: string,
  answer: {
    screen: string
    for: number
    status: number
    html: string
    page: Page | undefined
    reads: string[]
    // The data files of tenants its reads opened, each as `<table>:<tenant>`.
    files?: string[]
    out?: Out
    personal?: NonNullable<Drawn['personal']>
  },
  now: number,
): void {
  const all = kept.get(o.handles) ?? new Map<string, Kept>()
  kept.set(o.handles, all)
  const out = answer.out
  const tables = readOf(o, answer.reads, answer.files ?? [])
  const size = answer.html.length * 2 + JSON.stringify(answer.page ?? null).length * 2
  all.delete(key)
  all.set(key, {
    until: now + answer.for,
    screen: answer.screen,
    tables,
    status: answer.status,
    html: answer.html,
    page: answer.page,
    size,
    ...(answer.out ? { out: answer.out } : {}),
    ...(tables ? { keys: [...tables].sort().map((one) => `t:${one}`) } : {}),
    ...(answer.personal ? { personal: answer.personal } : {}),
  })
  // A public answer is dropped when its time is up, and a cache outside is told so: it keeps it no longer either.
  const held = all.get(key)
  if (out && held)
    o.clock.setTimer(held.until, () => {
      if (all.get(key) !== held) return
      all.delete(key)
      tellStale(o, { addresses: [out], why: 'time' })
    })
  const most = limitOf(o.description, 'pageCacheSize')
  const perScreen = limitOf(o.description, 'pageCachePerScreen')
  const ofScreen = [...all].filter(([, one]) => one.screen === answer.screen)
  for (const [old] of ofScreen.slice(0, Math.max(0, ofScreen.length - perScreen))) all.delete(old)
  let total = [...all.values()].reduce((sum, one) => sum + one.size, 0)
  for (const [old, one] of all) {
    if (total <= most) break
    all.delete(old)
    total -= one.size
  }
}

/**
 * Is told the tables and the rows that a committed write touched, and `every` where the write names neither:
 * each kept answer whose queries read a touched table is dropped at once, and with `every` all of them.
 */
export function cacheWrote(o: Opened, touched: Touched[], every: boolean): void {
  const all = kept.get(o.handles)
  if (!all) return
  const stale: Out[] = []
  for (const [key, one] of all) {
    const read = one.tables
    if (every || !read || touched.some((write) => write.table === '' || readsOf(read, write))) {
      all.delete(key)
      if (one.out) stale.push(one.out)
    }
  }
  // A cache outside the engine is told the addresses whose public answers went stale, with the keys of the write.
  if (stale.length) {
    const keys = keysHeaderOf(o)
      ? [
          ...new Set(
            touched
              .filter((one) => one.table !== '')
              .flatMap((one) => [`t:${one.table}`, ...(one.file ? [`t:${one.table}:${one.file.id}`] : [])]),
          ),
        ]
      : []
    tellStale(o, { addresses: stale, ...(keys.length ? { keys } : {}), why: 'write' })
  }
}

/** The header that names the keys of a public answer, where the project names one. */
export function keysHeaderOf(o: Opened): string | undefined {
  const header: unknown = Reflect.get(Object(o.description.project.cache), 'keysHeader')
  return typeof header === 'string' && header !== '' ? header.toLowerCase() : undefined
}

/**
 * What an answer read, by the functions it read and the data files of tenants its reads opened: each table, and a
 * tenant table as `<table>:<tenant>` for each file of it that was opened, so that a write to the file
 * of another tenant leaves it. Nothing where a table is not known: any write then drops it.
 */
function readOf(o: Opened, reads: string[], files: string[]): Set<string> | undefined {
  const tables = new Set<string>()
  for (const name of reads) {
    const read = tablesRead(o.description, name)
    if (!read) return undefined
    for (const table of read) {
      const tenanted = Reflect.get(Object(o.description.tables[table]), 'tenant') !== undefined
      const opened = tenanted ? files.filter((one) => one.startsWith(`${table}:`)) : []
      if (opened.length) for (const one of opened) tables.add(one)
      else tables.add(table)
    }
  }
  return tables
}

/** Whether a write reaches what an answer read: its table, or the file of its tenant where the answer read that. */
const readsOf = (tables: Set<string>, write: Touched): boolean =>
  tables.has(write.table) || (write.file !== undefined && tables.has(`${write.table}:${write.file.id}`))

/** The keys of an answer that read some functions: each table it read, a tenant's file as `t:<table>:<tenant>`. */
export function cacheKeysOf(o: Opened, reads: string[], files: string[] = []): string[] | undefined {
  const tables = readOf(o, reads, files)
  return tables && [...tables].sort().map((one) => `t:${one}`)
}
