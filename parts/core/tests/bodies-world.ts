import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { TentError } from '../index.ts'
import type { Runtime } from '../internal.ts'
import { matches, setRuntime } from '../internal.ts'

/** The folder of the twenty bodies, as they were copied from the trial with the stored form of each. */
export const folder = join(import.meta.dirname, 'bodies')

// A body file is answered what the build answers for a backend file, so that its text runs as it is written: the
// entry of the part, and a text file as its text. The app that the bodies import lies beside their folder.
registerHooks({
  resolve(specifier, context, next) {
    const to = (file: string) => ({ url: pathToFileURL(file).href, shortCircuit: true })
    if (specifier === 'tentjs') return to(join(folder, '..', '..', 'index.ts'))
    return next(specifier, context)
  },
  load(url, context, next) {
    if (!url.endsWith('.txt')) return next(url, context)
    const text = readFileSync(fileURLToPath(url), 'utf8')
    return { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(text)}` }
  },
})

type Note = (what: string, name: string, args: unknown[]) => void
type Row = Record<string, unknown>
type Tables = Record<string, Row[]>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/**
 * A copy of a value in plain data, so that the calls of two runs can be held against each other. A definition that
 * is handed on is counted by its name, an arrow is a mark, and a record of types is noted by the names of its
 * fields, which have no order of their own. Every other record keeps the order of its keys.
 */
function noted(value: unknown): unknown {
  if (typeof value === 'function')
    return 'definition' in value && typeof value.definition === 'string'
      ? `<definition ${value.definition}>`
      : '<arrow>'
  if (!isRecord(value)) return value
  if (value instanceof Date) return new Date(value)
  if (typeof value.then === 'function') return '<promise>'
  if (typeof value.definition === 'string') return `<definition ${value.definition}>`
  if (Array.isArray(value)) return value.map(noted)
  const isType = typeof value.kind === 'string'
  const values = Object.values(value)
  const isShape = values.length > 0 && values.every((one) => isRecord(one) && typeof one.kind === 'string')
  const keys = isType || isShape ? Object.keys(value).sort() : Object.keys(value)
  return Object.fromEntries(keys.map((key) => [key, noted(value[key])]))
}

/** What the tables and the `db` of one run share. */
interface World {
  tables: Tables
  note: Note
  waits: boolean
  moment: Date
}

const filterOf = (written: unknown): Row => (isRecord(written) ? written : {})

/** Whether a row fits a filter as a body writes one: each column held to a value, or to one operator. */
function fits(row: Row, written: unknown): boolean {
  return Object.entries(filterOf(written)).every(([col, asked]) => {
    if (isRecord(asked) && 'given' in asked) {
      const value = asked.given
      return value === undefined || value === null || value === '' || matches({ col, is: value }, row)
    }
    if (isRecord(asked) && !(asked instanceof Date)) return matches({ col, ...asked }, row)
    return matches({ col, is: asked }, row)
  })
}

/** A chain of the test `db`: it notes every member that is called, and answers at once or as a promise. */
class Chain {
  world: World
  table: string
  system: boolean
  steps: [string, unknown[]][]

  constructor(world: World, table: string, system: boolean, steps: [string, unknown[]][]) {
    this.world = world
    this.table = table
    this.system = system
    this.steps = steps
  }

  called(member: string, args: unknown[]): void {
    this.world.note('db', `${this.system ? 'system.' : ''}${this.table}.${member}`, args)
  }

  next(member: string, args: unknown[]): Chain {
    this.called(member, args)
    return new Chain(this.world, this.table, this.system, [...this.steps, [member, args]])
  }

  answer(value: unknown): unknown {
    return this.world.waits ? Promise.resolve(value) : value
  }

  byId(table: string, id: unknown): Row | undefined {
    const found = this.world.tables[table]?.find((row) => row.id === id)
    return found ? { ...found } : undefined
  }

  rows(): Row[] {
    let rows = this.world.tables[this.table]
    for (const [member, [a]] of this.steps) {
      const by = String(a)
      if (member === 'where') rows = rows.filter((row) => fits(row, a))
      else if (member === 'newest') rows = [...rows].sort((x, y) => Number(y[by]) - Number(x[by]))
      else if (member === 'oldest' || member === 'sort') rows = [...rows].sort((x, y) => Number(x[by]) - Number(y[by]))
      else if (member === 'skip') rows = rows.slice(Number(a))
      else if (member === 'limit') rows = rows.slice(0, Number(a))
    }
    const linked = this.steps.filter(([member]) => member === 'with').map(([, [column]]) => String(column))
    const picked = this.steps.find(([member]) => member === 'pick')?.[1][0]
    return rows.map((row) => {
      const copy: Row = Array.isArray(picked)
        ? Object.fromEntries(picked.map((column) => [column, row[column]]))
        : { ...row }
      for (const column of linked) copy[column] = this.byId(`${column}s`, row[column])
      return copy
    })
  }

  where(...args: unknown[]): Chain {
    return this.next('where', args)
  }
  with(...args: unknown[]): Chain {
    return this.next('with', args)
  }
  newest(...args: unknown[]): Chain {
    return this.next('newest', args)
  }
  oldest(...args: unknown[]): Chain {
    return this.next('oldest', args)
  }
  sort(...args: unknown[]): Chain {
    return this.next('sort', args)
  }
  limit(...args: unknown[]): Chain {
    return this.next('limit', args)
  }
  skip(...args: unknown[]): Chain {
    return this.next('skip', args)
  }
  pick(...args: unknown[]): Chain {
    return this.next('pick', args)
  }
  search(...args: unknown[]): Chain {
    return this.next('search', args)
  }
  after(...args: unknown[]): Chain {
    return this.next('after', args)
  }
  group(...args: unknown[]): Chain {
    return this.next('group', args)
  }
  near(...args: unknown[]): Chain {
    return this.next('near', args)
  }

  all(): unknown {
    this.called('all', [])
    return this.answer(this.rows())
  }

  first(): unknown {
    this.called('first', [])
    return this.answer(this.rows()[0])
  }

  count(...args: unknown[]): unknown {
    this.called('count', args)
    return this.answer(args.length ? this.rows().filter((row) => fits(row, args[0])).length : this.rows().length)
  }

  get(id: unknown): unknown {
    this.called('get', [id])
    return this.answer(this.byId(this.table, id))
  }

  history(id: unknown): unknown {
    this.called('history', [id])
    return this.answer([{ at: this.world.moment, by: 'u1', value: this.byId(this.table, id) }])
  }

  add(values: Row): unknown {
    this.called('add', [values])
    const rows = this.world.tables[this.table]
    const row = { id: `${this.table}-${rows.length + 1}`, ...values }
    rows.push(row)
    return this.answer({ ...row })
  }

  change(id: unknown, values: Row): unknown {
    this.called('change', [id, values])
    const row = this.world.tables[this.table].find((one) => one.id === id)
    if (row) Object.assign(row, values)
    return this.answer(row ? { ...row } : undefined)
  }

  remove(id: unknown): unknown {
    this.called('remove', [id])
    const rows = this.world.tables[this.table]
    const at = rows.findIndex((row) => row.id === id)
    if (at !== -1) rows.splice(at, 1)
    return this.answer(undefined)
  }
}

/** The tables of a `db`, each answered as a new chain at every read. */
function tablesOf(world: World, system: boolean): Record<string, unknown> {
  const db = {}
  for (const table of Object.keys(world.tables))
    Object.defineProperty(db, table, { enumerable: true, get: () => new Chain(world, table, system, []) })
  return db
}

/** A `db` over tables kept in memory, which notes every member that is called. */
function testDb(world: World): Record<string, unknown> {
  return Object.assign(tablesOf(world, false), { system: tablesOf(world, true) })
}

/** What the test runtime answers for each definition of the app. */
const answers: Record<string, (...args: never[]) => unknown> = {
  orderTotal: () => 120,
  ordersPage: ({ after }: { after?: string }) => ({
    rows: [{ id: 'o4', total: 1500 }],
    next: after ? undefined : 'o4',
  }),
  markPaid: ({ order }: { order: string }) => ({ id: order, status: 'paid' }),
  reopen: ({ order }: { order: string }) => ({ id: order, status: 'open' }),
  addUser: (values: Row) => ({ id: 'user-9', ...values }),
  sendReceipt: async ({ order }: { order: string }) => ({ sent: true, order }),
  sendWelcome: async ({ customer }: { customer: string }) => ({ welcomed: customer }),
  helper: async ({ message }: { message: string }) => ({ text: `Helper heard: ${message}` }),
  'helper.approve': async (run: string, step: string) => ({ approved: step, run }),
  'sendWelcome.working': async () => [{ run: 'run-7', step: 'mail' }],
  'sendReceipt.working': async () => [],
  painter: async () => ({ picture: 'file-3' }),
  'stripe.createRefund': async ({ charge }: { charge: string }) => ({ id: 're_1', charge }),
  'stripe.getCharge': async ({ id }: { id: string }) => ({ id, paid: true }),
  'slack.postMessage': async () => ({ ok: true }),
  'writer.reply': async (prompt: string) => ({ text: `Reply to: ${prompt}` }),
  'writer.fill': async (_: unknown, prompt: string) => ({
    mood: prompt.includes('!') ? 'angry' : 'calm',
    summary: 'A short summary.',
  }),
}

/** The moment of every run. */
export const NOW = new Date('2026-10-01T12:00:00.000Z')

/** The user of every run. */
const USER = { id: 'u1', roles: ['staff'] }

/** The rows of every table, made anew for each run. */
function rows(): Tables {
  const at = (day: string) => new Date(`2026-09-${day}T10:00:00.000Z`)
  return {
    orders: [
      { id: 'o1', customer: 'c1', status: 'open', total: 120, placedAt: at('01'), owner: 'u1', chargeId: 'ch_1' },
      { id: 'o2', customer: 'c2', status: 'open', total: 640, placedAt: at('03'), owner: 'u2' },
      { id: 'o3', customer: 'c1', status: 'paid', total: 80, placedAt: at('05'), owner: 'u1', chargeId: 'ch_3' },
      { id: 'o4', customer: 'c9', status: 'open', total: 1500, placedAt: at('28'), owner: 'u1' },
      { id: 'o5', customer: 'c2', status: 'paid', total: 310.5, placedAt: at('09'), owner: 'u2' },
    ],
    customers: [
      { id: 'c1', name: 'Maya Demir', email: 'maya@example.com' },
      { id: 'c2', name: 'Ali Kaya', email: 'ali@example.com' },
    ],
    payments: [
      { id: 'p1', order: 'o3', amount: 80 },
      { id: 'p2', order: 'o5', amount: 300 },
      { id: 'p3', order: 'o5', amount: 10.5 },
    ],
    videos: [{ id: 'v1', state: 'new' }],
  }
}

/** The answer of the test runtime for a definition. It throws for a name it has no answer for. */
function answerOf(name: string, args: unknown[]): unknown {
  if (!Object.hasOwn(answers, name)) throw new Error(`The test runtime has no answer for ${name}.`)
  return Reflect.apply(answers[name], undefined, args)
}

const randoms = [0.31, 0.84, 0.12]

/**
 * A runtime for the slot, which notes every call that reaches it, in order, and answers the same for the same
 * call. `mayWait` is whether the call that is under way may wait, and nothing where no call is. `valueSize` is the
 * limit of the app whose call is under way, and nothing for an app that states none. Every word that makes a list
 * or a text asks for that limit, which is no call of a body, so it is not noted.
 */
export function testRuntime(note: Note, mayWait: boolean | undefined, valueSize?: number): Runtime {
  let drew = 0
  const noting =
    (what: string, name: string, answer: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      note(what, name, args)
      return answer(...args)
    }
  const handles: Record<string, object> = {
    mail: { send: noting('handle', 'mail.send', async () => undefined) },
    sessions: { start: noting('handle', 'sessions.start', (user) => ({ id: 'session-1', user })) },
    files: { put: noting('handle', 'files.put', async () => 'file-7') },
    log: { info: noting('handle', 'log.info', () => undefined) },
    connections: {
      start: noting(
        'handle',
        'connections.start',
        (service) => `https://shop.test/_t/connect/${isRecord(service) ? service.definition : ''}`,
      ),
    },
    settings: { shopName: 'Corner Shop', vat: 0.2 },
  }
  return {
    call(name, args) {
      note('call', name, args)
      return answerOf(name, args)
    },
    handle: (name) => handles[name],
    start(flow, input) {
      note('start', flow, [input])
      return { run: 'run-1' }
    },
    emit(event, data) {
      note('emit', event, [data])
    },
    draw(word, args) {
      if (word === 'valueSize') return valueSize === undefined ? undefined : { value: valueSize }
      note('draw', word, args)
      drew++
      if (word === 'now') return { value: NOW }
      if (word === 'mayWait') return mayWait === undefined ? undefined : { value: mayWait }
      if (word === 'random') return { value: randoms[drew % randoms.length] }
      if (word === 'zone') return { value: 'Europe/Istanbul' }
      const [o] = args
      const digits = isRecord(o) && typeof o.digits === 'number' ? o.digits : undefined
      return { value: digits ? String(drew).padStart(digits, '0') : `token-${drew}` }
    },
  }
}

/** What `step.done` ends a run with: whoever runs the flow takes its value as the answer. */
class RunDone {
  value: unknown
  constructor(value: unknown) {
    this.value = value
  }
}

const saved = (result: unknown): unknown => (result === undefined ? undefined : JSON.parse(JSON.stringify(result)))

type Work = (...args: unknown[]) => unknown
const isWork = (value: unknown): value is Work => typeof value === 'function'

/** The `step` of the test: it runs each step once, at once, notes every tool that is called, and answers a result as it would be saved. */
function testStep(note: Note): object {
  const sideBySide = (list: unknown, arrow: unknown): unknown[] => {
    const entries = Array.isArray(list) ? list : []
    return entries.map((entry, i) => (isWork(arrow) ? arrow(entry, i) : isWork(entry) ? entry() : undefined))
  }
  const step = async (name: string, work: Work, o?: unknown) => {
    note('step', name, o === undefined ? [] : [o])
    return saved(await work({}))
  }
  return Object.assign(step, {
    wait: async (...args: unknown[]) => note('step.wait', '', args),
    waitFor: async (what: unknown, o?: { timeout?: string }) => {
      note('step.waitFor', '', [what, o])
      return typeof what === 'string'
        ? { approved: o?.timeout !== '1 hour', data: {} }
        : { timedOut: o?.timeout === '2 days' }
    },
    all: (list: unknown, arrow: unknown) => {
      note('step.all', '', [list, arrow])
      return Promise.all(sideBySide(list, arrow))
    },
    first: (list: unknown, arrow: unknown) => {
      note('step.first', '', [list, arrow])
      return Promise.race(sideBySide(list, arrow))
    },
    many: async (name: string, entries: unknown, flow: unknown, o: unknown) => {
      note('step.many', name, [entries, flow, o])
      return { entries: 3, done: 3, failed: 0 }
    },
    now: async () => {
      note('step.now', '', [])
      return NOW.toISOString()
    },
    done: async (value: unknown) => {
      note('step.done', '', [value])
      throw new RunDone(value)
    },
    random: async () => {
      note('step.random', '', [])
      return 0.42
    },
  })
}

/** One case of a body: what its `run` is handed. */
export interface Case {
  name: string
  input?: unknown
  event?: unknown
  fails?: true
}

/** What was seen of one run. */
export interface Seen {
  ok: boolean
  atOnce: boolean
  answer?: unknown
  failure?: unknown
  calls: [string, string, unknown][]
}

/**
 * Takes the kind of a definition, whether it states `system`, and a case. Fills the slot with a test runtime, and
 * answers what a `run` of that kind is handed, in a world made anew. `note` is told every call.
 */
function handedFor(kind: string, system: boolean, c: Case, note: Note): Record<string, unknown> {
  const waits = kind === 'action' || kind === 'flow'
  setRuntime(testRuntime(note, waits))
  const db = testDb({ tables: rows(), note, waits, moment: NOW })
  if (kind === 'flow') return { event: c.event, input: c.input, user: USER, step: testStep(note), db }
  if (kind !== 'action') return { input: c.input, db, user: USER, now: NOW }
  const call = (fn: { definition: string }, ...input: unknown[]) => {
    note('call as the system', fn.definition, input)
    return answerOf(fn.definition, input)
  }
  return { input: c.input, user: USER, db, about: undefined, ...(system ? { call } : {}) }
}

const settled = () => new Promise((resolve) => setImmediate(resolve))

/** Runs a piece of work with what a `run` is handed, and answers what was seen: the answer or the failure, whether it answered at once, and every call in order. */
export async function oneRun(
  kind: string,
  system: boolean,
  c: Case,
  work: (handed: Record<string, unknown>) => unknown,
): Promise<Seen> {
  const calls: Seen['calls'] = []
  const handed = handedFor(kind, system, c, (what, name, args) => calls.push([what, name, noted(args)]))
  let atOnce = true
  try {
    const returned = work(handed)
    atOnce = !(isRecord(returned) && typeof returned.then === 'function')
    const answer = await returned
    await settled()
    return { ok: true, atOnce, answer, calls }
  } catch (failure) {
    await settled()
    if (failure instanceof RunDone) return { ok: true, atOnce, answer: failure.value, calls }
    return { ok: false, atOnce, failure, calls }
  } finally {
    setRuntime(null)
  }
}

/** Whether two failures are the same: a `TentError` with its code and its words, and any other failure by its kind. */
export function sameFailure(a: unknown, b: unknown): boolean {
  if (a instanceof TentError || b instanceof TentError)
    return a instanceof TentError && b instanceof TentError && a.code === b.code && a.message === b.message
  return a instanceof Error && b instanceof Error && a.constructor === b.constructor
}
