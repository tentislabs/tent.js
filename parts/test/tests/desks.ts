import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { App, Engine, Makers } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import type { TestClock } from '../clock.ts'
import { testClock } from '../clock.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf, tempOf } from './projects.ts'

/** What a test changes of the project of the desk before it is built: each a table change of the tenant tables. */
export interface DeskChange {
  // `title` of `orders` goes on as `name`: a change that every file is brought up for, and that a read shows.
  renamed?: boolean
  // No two orders of one team share a `code`: rows that share one do not fit.
  codeUnique?: boolean
  // `code` of `orders` must hold a value: a row that holds none does not fit.
  codeRequired?: boolean
  // `total` of `orders` becomes a text: the table is rebuilt.
  totalText?: boolean
  // `title` of `orders` went on as `name` in the version before, and this version states that no more.
  renamedBefore?: boolean
  // How many files may be open at once, where it is not the 50 of the project.
  openFiles?: number
  // How many files are brought up at once, where it is not the 4 of the project.
  filesAtOnce?: number
  // The time of a change, as the project writes it, where it is not the 5 seconds of the framework.
  changeTime?: string
  // The time of a query, as the project writes it, where it is not the second of the framework.
  queryTime?: string
  // No table is a tenant table yet: the app has its users, its teams and their members, and nothing else.
  noFiles?: boolean
  // A second table has tenants too: the stock of each shop stands in a file of that shop.
  shops?: boolean
}

// The tables and the functions of the shops, as the project of the desk writes its own.
const shopTables = `
export const shops = table('shops', {
  columns: { name: text() },
  access: { read: open, add: open, remove: open },
})

export const stock = table('stock', {
  columns: { shop: link('shops', { onRemove: 'remove' }), item: text() },
  tenant: 'shop',
  access: { read: open, add: open },
})
`
const shopFunctions = `
import { shops, stock } from '../tables/tables'

export const addShop = change('addShop', {
  access: open,
  input: { name: text() },
  set: shops.add({ name: input('name') }),
})

export const addStock = change('addStock', {
  access: open,
  input: { shop: text(), item: text() },
  set: stock.of(input('shop')).add({ item: input('item') }),
})

export const listStock = query('listStock', {
  access: open,
  input: { shop: text() },
  rows: stock.of(input('shop')).oldest('createdAt'),
})
`

// The functions of the desk that keeps no file yet.
const plainFunctions = `import { anyone, change, input, text } from 'tentjs'
import { teams } from '../tables/tables'

export const addTeam = change('addTeam', {
  access: anyone('a test calls it'),
  input: { name: text() },
  set: teams.add({ name: input('name') }),
})
`

/** Writes one file of a copy of the project anew, by what a change makes of its text. */
function rewritten(project: string, file: string, change: (text: string) => string): void {
  const path = join(project, file)
  const text = readFileSync(path, 'utf8')
  const made = change(text)
  assert.notEqual(made, text, `the change of ${file} changes it`)
  writeFileSync(path, made)
}

/** Copies the project of the desk into a folder of the test, with the changes that the test asks for. */
function deskProject(t: TestContext, o: DeskChange = {}): string {
  const project = copyOf(t, 'desk')
  if (o.renamed || o.renamedBefore) {
    const named = o.renamedBefore ? 'name: text(),' : "name: text({ was: 'title' }),"
    rewritten(project, 'tables/tables.ts', (text) => text.replace('title: text(),', named))
    rewritten(project, 'functions/functions.ts', (text) =>
      text
        .replace("add({ title: input('title'),", "add({ name: input('title'),")
        .replaceAll('add({ title: `', 'add({ name: `'),
    )
  }
  if (o.codeRequired)
    rewritten(project, 'tables/tables.ts', (text) => text.replace('code: text({ optional: true }),', 'code: text(),'))
  if (o.codeUnique)
    rewritten(project, 'tables/tables.ts', (text) =>
      text.replace(/(placedBy: [^\n]*\n {2}\},\n {2}tenant: 'team',\n)/, "$1  unique: [['code']],\n"),
    )
  if (o.totalText)
    rewritten(project, 'tables/tables.ts', (text) =>
      text.replace('total: number({ default: 0 }),', 'total: text({ optional: true }),'),
    )
  if (o.openFiles !== undefined)
    rewritten(project, 'tent.ts', (text) => text.replace('openFiles: 50', `openFiles: ${o.openFiles}`))
  if (o.filesAtOnce !== undefined)
    rewritten(project, 'tent.ts', (text) => text.replace('filesAtOnce: 4', `filesAtOnce: ${o.filesAtOnce}`))
  if (o.changeTime !== undefined)
    rewritten(project, 'tent.ts', (text) => text.replace('filesAtOnce:', `changeTime: '${o.changeTime}', filesAtOnce:`))
  if (o.queryTime !== undefined)
    rewritten(project, 'tent.ts', (text) => text.replace('filesAtOnce:', `queryTime: '${o.queryTime}', filesAtOnce:`))
  if (o.shops) {
    rewritten(project, 'tables/tables.ts', (text) => `${text}${shopTables}`)
    rewritten(project, 'functions/functions.ts', (text) => `${text}${shopFunctions}`)
  }
  if (o.noFiles) {
    rewritten(project, 'tables/tables.ts', (text) => text.slice(0, text.indexOf('// A row of a tenant table')))
    rewritten(project, 'functions/functions.ts', () => plainFunctions)
  }
  return project
}

// The temporary place of each test, in which its test app keeps the folders of its machines.
const temps = new WeakMap<TestContext, string>()

/** A test app of the desk, and where the data of its first machine lies. */
export interface Desk {
  app: TestApp
  dataFolder: string
}

/** Opens the test app of a project, on empty temporary data under the folder of the test, closed when the test ends. */
export async function appIn(t: TestContext, project: string): Promise<Desk> {
  const temp = temps.get(t) ?? tempOf(t)
  temps.set(t, temp)
  const before = new Set(readdirSync(temp))
  const app = await testApp({ folder: project })
  closing(t, () => app.close())
  const [home] = readdirSync(temp).filter((one) => one.startsWith('tent-test-') && !before.has(one))
  return { app, dataFolder: join(temp, home ?? '', 'data') }
}

/** Opens the test app of the desk, with the changes that the test asks for. */
export const deskOf = (t: TestContext, o: DeskChange = {}): Promise<Desk> => appIn(t, deskProject(t, o))

/** The data folder of a reader of a desk: `reader-<n>`, counted from 2 in the order the readers were made. */
export const readerFolder = (desk: Desk, n: number): string => join(desk.dataFolder, '..', `reader-${n}`)

/** An empty place for a data folder that a program of the test opens by itself. */
export const dataPlace = (t: TestContext): string => join(copyOf(t, 'bare'), 'data')

/** An app of the desk in an engine of the test's own, on a data folder that the test names. */
export interface Opened {
  engine: Engine
  app: App
  clock: TestClock
  dataFolder: string
}

/** Builds the project of the desk with the changes of the test, and answers the folder of its bundle. */
export async function deskBundle(t: TestContext, o: DeskChange = {}): Promise<string> {
  const project = deskProject(t, o)
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  return built.bundleFolder
}

/**
 * Opens a bundle of the desk on a data folder, in an engine of its own with a clock that the test moves, and with
 * the makers that the test hands in. The engine is closed when the test ends, before the folders of the test are
 * removed.
 */
export async function openOn(t: TestContext, bundle: string, dataFolder: string, makers: Makers = {}): Promise<Opened> {
  const { clock, moves } = testClock()
  const engine = createEngine({ port: 0, makers: { clock: () => clock, ...makers } })
  closing(t, () => engine.close())
  try {
    const app = await engine.open(bundle, { dataFolder, mode: 'test', address: '*' })
    return { engine, app, clock: moves, dataFolder }
  } catch (error) {
    await engine.close()
    throw error
  }
}

/** A writer and a near reader of the desk in two engines of the test's own, joined with no network, on one clock. */
export interface Pair {
  clock: TestClock
  writer: { app: App; dataFolder: string }
  reader: { app: App; dataFolder: string }
  /** Closes the writer, and opens its folder again with another bundle. `between` is done while it is closed. */
  reopen(bundle: string, between?: () => void): Promise<App>
  /** Stops the reader with whatever it works on, and starts it again on its folder. */
  restartReader(): Promise<void>
  /** Moves the clock one beat on, some times, and lets what the beats sent arrive. */
  beat(times?: number): Promise<void>
  /** Closes both machines. */
  close(): Promise<void>
}

const addresses = { writer: 'https://writer.tent.test', reader: 'https://reader.tent.test' }

/**
 * Opens a bundle of the desk as a writer that lets one near reader join, and that reader beside it, on data
 * folders of the test. Both are closed when the test ends.
 */
export async function pairOf(
  t: TestContext,
  bundle: string,
  dataFolder: string,
  // What is done before each request that the reader sends its writer: a test holds one back with it.
  before: (request: Request) => Promise<void> = async () => undefined,
): Promise<Pair> {
  const { clock, moves } = testClock()
  const key = 'k'.repeat(40)
  const engines: Engine[] = []
  const apps: { writer?: App } = {}
  const closeAll = async (): Promise<void> => {
    for (const engine of engines.splice(0).reverse()) await engine.close()
  }
  closing(t, closeAll)
  const openWriter = async (from: string): Promise<App> => {
    const engine = createEngine({ port: 0, makers: { clock: () => clock } })
    engines.push(engine)
    apps.writer = await engine.open(from, {
      dataFolder,
      mode: 'test',
      address: '*',
      own: addresses.writer,
      readers: [key],
    })
    return apps.writer
  }
  const first = await openWriter(bundle)
  const readerFolder = join(dataFolder, '..', 'reader-data')
  let reading: Engine | undefined
  const openReader = async (): Promise<App> => {
    const engine = createEngine({ port: 0, makers: { clock: () => clock } })
    engines.push(engine)
    reading = engine
    return engine.read({
      from: addresses.writer,
      key,
      dataFolder: readerFolder,
      own: addresses.reader,
      address: '*',
      reach: (address) =>
        address === addresses.writer
          ? {
              async request(request, o) {
                await before(request)
                if (!apps.writer) throw new Error('the writer does not run')
                return apps.writer.request(request, o)
              },
              link(request) {
                if (!apps.writer) throw new Error('the writer does not run')
                return apps.writer.link(request)
              },
            }
          : undefined,
    })
  }
  /** Closes one engine of the pair, which is then none of those that the end of the test closes. */
  const closed = async (engine: Engine | undefined): Promise<void> => {
    await engine?.close()
    if (engine) engines.splice(engines.indexOf(engine), 1)
  }
  const pair: Pair = {
    clock: moves,
    writer: { app: first, dataFolder },
    reader: { app: await openReader(), dataFolder: readerFolder },
    async reopen(next, between) {
      delete apps.writer
      await closed(engines.find((one) => one !== reading))
      between?.()
      pair.writer.app = await openWriter(next)
      return pair.writer.app
    },
    async restartReader() {
      await closed(reading)
      pair.reader.app = await openReader()
    },
    close: closeAll,
    async beat(times = 1) {
      for (let i = 0; i < times; i++) {
        moves.advance('1 second')
        await new Promise((done) => setTimeout(done, 15))
      }
    },
  }
  return pair
}

/** Carries a command of the admin channel out on an app, with no network, and answers its value. Throws its error. */
export async function command(app: App, dataFolder: string, name: string, args: object = {}): Promise<unknown> {
  const { port, token } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  const request = new Request(`http://127.0.0.1:${port}/_t/admin/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ args }),
  })
  const body: Record<string, unknown> = Object(await (await app.request(request)).json())
  if (body.ok === true) return body.value
  const error: Record<string, unknown> = Object(body.error)
  throw Object.assign(new Error(String(error.message)), { code: error.code })
}

/** One file of a tenant as `tent data files` lists it. */
interface Listed {
  table: string
  id: string
  layout: string
  tables: string[]
  writes: number
  size: number
  open: boolean
  behind: boolean
  unswept: boolean
  failed?: { code?: string; message: string }
  due?: number
}

/** What `tent data files` answers: the directory, and with a flag what that flag did. */
export interface FilesAnswer {
  files: Listed[]
  stray?: { removed: string[]; listed: string[]; folded: string[]; refused: string[]; temporary: number }
  swept?: number
  retried?: { id: string; ok: boolean }
}

/** `tent data files`, asked of a running app. */
export async function listed(app: App, dataFolder: string, flags: object = {}): Promise<FilesAnswer> {
  const answer: unknown = await command(app, dataFolder, 'data', { what: 'files', ...flags })
  const held: Record<string, unknown> = Object(answer)
  assert.ok(Array.isArray(held.files), 'the command answers the files')
  return Object.assign({ files: [] }, held)
}

/** Where the data file of a team stands in a data folder. */
export const fileOf = (dataFolder: string, team: string): string =>
  join(dataFolder, 'tenants', 'teams', team.slice(-2), `${team}.db`)

/** Whether a data folder holds the file of a team. */
export const hasFile = (dataFolder: string, team: string): boolean => existsSync(fileOf(dataFolder, team))

/** Every file of a team that stands in a data folder, by the id of its team, in the order of the ids. */
export function teamFilesIn(dataFolder: string): string[] {
  const root = join(dataFolder, 'tenants', 'teams')
  if (!existsSync(root)) return []
  return readdirSync(root)
    .flatMap((two) => readdirSync(join(root, two)))
    .filter((name) => name.endsWith('.db'))
    .map((name) => name.slice(0, -3))
    .sort()
}

/** What stands beside the data file of a team: the two files that SQLite keeps beside a file that is open. */
export const besideOf = (dataFolder: string, team: string): string[] =>
  ['-wal', '-shm'].filter((ending) => existsSync(`${fileOf(dataFolder, team)}${ending}`))

/** Reads a data file that no engine holds open, by a text of SQL, and answers its rows. */
export function readFile(file: string, sql: string): Record<string, unknown>[] {
  const db = new DatabaseSync(file)
  try {
    return db.prepare(sql).all()
  } finally {
    db.close()
  }
}

/** Carries a text of SQL out on a data file that no engine holds open. */
export function writeFile(file: string, sql: string, ...values: (string | number)[]): void {
  const db = new DatabaseSync(file)
  try {
    db.prepare(sql).run(...values)
  } finally {
    db.close()
  }
}

/** The id of the row that a change answered. */
export const idOf = (row: unknown): string => String(Reflect.get(Object(row), 'id'))

const system = { as: 'system' } as const

/** Adds a team, as the system, and answers its id. */
export const addTeam = async (app: App, name: string): Promise<string> =>
  idOf(await app.call('addTeam', { name }, { as: { kind: 'system' } }))

/** Adds an order of a team, as the system, and answers its id. */
export const addOrder = async (app: App, team: string, title: string, more: object = {}): Promise<string> =>
  idOf(await app.call('addOrder', { team, title, ...more }, { as: { kind: 'system' } }))

/** The orders of a team, as the system reads them, in the order they were added. */
export async function ordersOf(app: App, team: string): Promise<Record<string, unknown>[]> {
  const read = await app.read({ from: 'orders', of: team, sort: [{ by: 'createdAt' }, { by: 'id' }] }, system)
  return Array.isArray(read) ? read : []
}

/** The titles of the orders of a team, in the order they were added. */
export const titlesOf = async (app: App, team: string): Promise<string[]> =>
  (await ordersOf(app, team)).map((row) => String(row.title ?? row.name))

/** How many calls of a name the log of a data folder holds: the calls that its machine answered itself. */
export function callsIn(dataFolder: string, name: string): number {
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    return Number(log.prepare('SELECT count(*) AS n FROM "calls" WHERE "name" = ?').get(name)?.n ?? 0)
  } finally {
    log.close()
  }
}

/** The rows of the lines of the log of a data folder whose message holds a piece, with their data read. */
export function logLines(dataFolder: string, piece: string): { message: string; data: Record<string, unknown> }[] {
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    return log
      .prepare('SELECT message, data FROM "lines" ORDER BY rowid')
      .all()
      .filter((row) => String(row.message).includes(piece))
      .map((row) => ({ message: String(row.message), data: Object(JSON.parse(String(row.data ?? '{}'))) }))
  } finally {
    log.close()
  }
}
