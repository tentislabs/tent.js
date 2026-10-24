import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import type { Caller, Db } from '../../core/index.ts'
import {
  anyone,
  boolean,
  calc,
  caller,
  choice,
  col,
  date,
  day,
  dayOf,
  file,
  json,
  link,
  list,
  number,
  object,
  project,
  role,
  round,
  sum,
  TentError,
  table,
  text,
  where,
  concat,
} from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { describe } from '../../core/internal.ts'
import type { Row, RuleCode, Store } from '../index.ts'
import { createDb, historyTable, layoutOf } from '../index.ts'
import { opened, workFolder } from './work.ts'

// A small app with every kind of rule: a shop whose customers belong to teams, and whose staff place orders.
const shop = project('shop', { zone: 'Europe/Istanbul' })

const users = table('users', {
  columns: {
    name: text(),
    email: text({ unique: true }),
    roles: list(text()),
    salary: number({ private: true, optional: true }),
  },
  access: { read: 'signedIn', add: role('admin'), change: 'owner', remove: role('admin') },
})

const teams = table('teams', {
  columns: { name: text() },
  access: { read: 'signedIn', add: role('admin'), change: role('admin'), remove: role('admin') },
})

const members = table('members', {
  columns: { team: link('teams', { onRemove: 'remove' }), user: link('users', { onRemove: 'remove' }) },
  access: { read: 'signedIn', add: role('admin') },
})

// A customer is read by the members of its team: a rule through a second table.
const inMyTeams = where({ team: { in: members.where({ user: caller('id') }).pick(['team']) } })
const customers = table('customers', {
  columns: {
    name: text({ max: 80 }),
    team: link('teams'),
    taxNo: text({ sealed: true, optional: true }),
    credit: number({ sealed: true, optional: true }),
    margin: number({ private: true, optional: true }),
    vip: boolean({ default: false }),
    since: day({ optional: true }),
  },
  access: { read: inMyTeams, add: role('staff'), change: role('staff'), remove: role('admin') },
  search: ['name'],
  keepHistory: true,
})

const orders = table('orders', {
  columns: {
    customer: link('customers'),
    placedBy: link('users'),
    net: number({ min: 0 }),
    status: choice(['open', 'paid', 'sent'], { default: 'open' }),
    placedAt: date({ default: 'now' }),
    note: text({ optional: true, max: 200 }),
    cost: number({ private: true, optional: true }),
    tags: list(text(), { optional: true }),
    gross: number({ from: round(calc('*', col('net'), 1.2), 2) }),
    label: text({ from: concat(col('status'), ' ', col('net')) }),
    placedOn: day({ from: dayOf(col('placedAt')) }),
    share: number({ optional: true, from: calc('/', col('net'), col('parts')) }),
    parts: number({ optional: true }),
    weights: list(number(), { optional: true }),
    weight: number({ optional: true, from: sum(col('weights')) }),
  },
  owner: 'placedBy',
  access: { read: 'owner', add: 'signedIn', change: role('staff'), remove: role('staff') },
  indexes: [['status', 'placedAt']],
  keepHistory: true,
})

const lines = table('lines', {
  columns: {
    order: link('orders', { onRemove: 'remove' }),
    product: link('products', { optional: true, onRemove: 'clear' }),
    qty: number({ whole: true, min: 1 }),
  },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

const products = table('products', {
  columns: { name: text(), code: text({ unique: true }), price: number() },
  access: { read: anyone('the list of products is public'), add: role('staff'), change: role('staff') },
  search: { columns: ['name'], by: 'pieces' },
})

// One column of every type but a vector, for what a store keeps and gives back.
const things = table('things', {
  columns: {
    title: text({ optional: true }),
    count: number({ optional: true }),
    whole: number({ optional: true, whole: true }),
    on: boolean({ optional: true }),
    at: date({ optional: true }),
    due: day({ optional: true }),
    kind: choice(['a', 'b'], { optional: true }),
    owner: link('users', { optional: true }),
    paper: file({ optional: true }),
    names: list(text(), { optional: true }),
    moments: list(date(), { optional: true }),
    shape: object({ label: text(), when: date({ optional: true }), deep: object({ n: number() }) }, { optional: true }),
    loose: json({ optional: true }),
    must: text(),
  },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

type Rules = Record<string, RuleCode>

/** The definitions of the shop, for a test that adds its own. */
export const definitions: object[] = [shop, users, teams, members, customers, orders, lines, products, things]

/** Describes definitions, and holds that nothing was found. */
export function described(
  all: object[] = definitions,
  bodies: Record<string, Record<string, object>> = {},
): Description {
  const { description, findings } = describe({
    definitions: all.map((value) => ({ value, bodies: bodies[String(Reflect.get(value, 'definition'))] })),
  })
  assert.deepEqual(
    findings.map((one) => `${one.code} ${one.message}`),
    [],
  )
  return description
}

/** Opens a store on a new folder of the test, with the tables of a description and the table of row history. */
export function shopStore(t: TestContext, description: Description = described()): Store {
  const store = opened(workFolder(t))
  store.write(() =>
    store.applyTableChanges(
      [...layoutOf(description), historyTable].map((layout) => ({ do: 'addTable', table: layout.name, layout })),
    ),
  )
  return store
}

/**
 * A table of a `db` as a test calls it. The types of the tables of a project are made by the build, which no test
 * of this part runs, so the members are written here once.
 */
export interface DbTable {
  where(filter: object): DbTable
  search(text: string): DbTable
  group(by: string | string[], values: Record<string, object>): DbTable
  with(...columns: string[]): DbTable
  near(column: string, value: number[], o?: { measure?: 'cosine' | 'straight'; within?: number }): DbTable
  newest(column: string): DbTable
  oldest(column: string): DbTable
  sort(...columns: string[]): DbTable
  limit(n: number): DbTable
  skip(n: number): DbTable
  after(cursor: string | undefined): DbTable
  pick(columns: string[]): DbTable
  of(customer: string): DbTable
  all(): Row[]
  first(): Row | undefined
  count(filter?: object): number
  get(id: string): Row | undefined
  history(id: string): { at: Date; by: string; value: Row }[]
  add(values: Row): Row
  change(id: string, values: Row): Row
  remove(id: string): void
}

/** Answers a table of a `db` by its name. */
export const at = (db: object, name: string): DbTable => Reflect.get(db, name)

/** Answers the raw SQL of a `db` that has full access, as a test of a query or a change calls it. */
export const sqlOf = (db: object): ((text: string, values?: unknown[]) => unknown[]) => Reflect.get(db, 'sql')

/** Answers what gives the inside number of a text id, of a `db` that has full access. */
export const nOf = (db: object): ((table: string, id: string) => number) => Reflect.get(db, 'n')

/** What `createDb` takes last. */
type DbOptions = Parameters<typeof createDb>[5]

/** Answers a function that carries out one write as a caller, with a `db` of that write handed to what it is given. */
export function writing(store: Store, description: Description, who: Caller, o?: DbOptions, rules: Rules = {}) {
  return <T>(work: (db: Db) => T): T =>
    store.write((tx) => work(createDb(tx, description, who, 'write', rules, o))).value
}

/** Answers a `db` that reads as a caller, at once. */
export const reading = (store: Store, description: Description, who: Caller, o?: DbOptions, rules: Rules = {}): Db =>
  createDb(store, description, who, 'read', rules, o)

/** Answers the fields that the error of a call names, or none where it throws no such error. */
export function fieldsOf(call: () => unknown): Record<string, string> {
  try {
    call()
  } catch (error) {
    if (error instanceof TentError) return error.fields ?? {}
  }
  return {}
}

/**
 * Adds the people, the teams and the first rows of the shop, as the system: Ada is staff and a member of North, Bob
 * a member of South, and Cy an admin in no team. Ada placed two orders for Acme, of North, and one for Bolt, of
 * South, whom she may not read. Bob placed one for Bolt. Answers the id of each.
 */
export function seedShop(store: Store, description: Description) {
  return writing(
    store,
    description,
    { kind: 'system' },
    { seal },
  )((db) => {
    const add = (table: string, values: Row) => String(at(db, table).add(values).id)
    const ada = add('users', { name: 'Ada', email: 'ada@example.com', roles: ['staff'], salary: 5000 })
    const bob = add('users', { name: 'Bob', email: 'bob@example.com', roles: [], salary: 4000 })
    const cy = add('users', { name: 'Cy', email: 'cy@example.com', roles: ['admin'] })
    const north = add('teams', { name: 'North' })
    const south = add('teams', { name: 'South' })
    add('members', { team: north, user: ada })
    add('members', { team: south, user: bob })
    const acme = add('customers', { name: 'Acme', team: north, taxNo: 'TR-1', margin: 0.3 })
    const bolt = add('customers', { name: 'Bolt', team: south, margin: 0.1 })
    const first = add('orders', { customer: acme, placedBy: ada, net: 10, note: 'the first order', cost: 7 })
    const second = add('orders', { customer: acme, placedBy: ada, net: 20, status: 'paid' })
    const far = add('orders', { customer: bolt, placedBy: ada, net: 30 })
    const bobs = add('orders', { customer: bolt, placedBy: bob, net: 40 })
    const nut = add('products', { name: 'Hex nut', code: 'N-1', price: 0.1 })
    const line = add('lines', { order: first, product: nut, qty: 3 })
    return { ada, bob, cy, north, south, acme, bolt, first, second, far, bobs, nut, line }
  })
}

/** A signed-in caller with an id and roles. */
export const user = (id: string, roles: string[] = []): Caller => ({ kind: 'user', user: { id, roles } })

/** A seal for tests: it turns the text of a value round, and binds it to its place with the bound in front. */
export const seal = {
  close: (value: unknown, bound: string): string => `sealed:${bound}:${[...JSON.stringify(value)].reverse().join('')}`,
  open(sealed: string, bound: string): unknown {
    const start = `sealed:${bound}:`
    if (!sealed.startsWith(start)) throw new Error(`a sealed value was opened under another bound: ${bound}`)
    return JSON.parse([...sealed.slice(start.length)].reverse().join(''))
  },
}
