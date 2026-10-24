import { caller, choice, link, list, number, project, role, table, text, vector, where } from '../../core/index.ts'
import type { Files } from '../index.ts'
import { createDb } from '../index.ts'
import { readingFiles, writingFiles } from './apart.ts'
import { at, described } from './shop.ts'
import { system } from './work.ts'

const members = table('members', {
  columns: { team: link('teams', { onRemove: 'remove' }), user: link('users', { onRemove: 'remove' }) },
  access: { read: 'signedIn', add: role('admin') },
})
const mine = where({
  team: {
    in: members.where({ user: caller('id') }).pick(['team']),
  },
})
const byMembers = { read: mine, add: mine, change: mine, remove: mine }
const bySignedIn = { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const
const team = () => link('teams', { onRemove: 'remove' })
const orders = table('orders', {
  columns: {
    team: team(),
    placedBy: link('users', { optional: true, onRemove: 'clear' }),
    total: number(),
    status: choice(['open', 'paid'], { default: 'open' }),
    note: text({ optional: true }),
    cost: number({ private: true, optional: true }),
    meaning: vector({ size: 4 }),
  },
  tenant: 'team',
  access: byMembers,
  search: ['note'],
  keepHistory: true,
})

/**
 * An app that keeps a data file for each team, with a door at each height. `orders` are read and written by the
 * members of the team, and a line by who may read its order while the order is open. `tasks` are open to every
 * signed-in caller, and link to an order, to a line and to a user that such a caller may not read. `drops` are
 * added only where the row itself fits a rule that names no tenant.
 */
export const board = described([
  project('board', {}),
  table('users', {
    columns: { name: text(), roles: list(text()), salary: number({ private: true, optional: true }) },
    access: { read: 'owner', add: role('admin'), change: 'owner', remove: role('admin') },
  }),
  table('teams', {
    columns: { name: text() },
    access: { read: 'signedIn', add: role('admin'), change: role('admin'), remove: role('admin') },
  }),
  members,
  orders,
  table('lines', {
    columns: { team: team(), order: link('orders', { onRemove: 'remove' }), qty: number() },
    tenant: 'team',
    access: { ...byMembers, read: where({ order: { in: orders.where({ status: 'open' }).pick(['id']) } }) },
  }),
  table('tasks', {
    columns: {
      team: team(),
      title: text(),
      order: link('orders', { optional: true, onRemove: 'clear' }),
      line: link('lines', { optional: true, onRemove: 'clear' }),
      assignee: link('users', { optional: true, onRemove: 'clear' }),
    },
    tenant: 'team',
    access: bySignedIn,
    search: ['title'],
    keepHistory: true,
  }),
  table('drops', {
    columns: { team: team(), kind: text() },
    tenant: 'team',
    access: { ...bySignedIn, add: where({ kind: 'fine' }) },
  }),
])

/**
 * Adds the people, the teams and the rows of the board, as the system. Ada is a member of North and Bob of South;
 * Cy is in no team; East has no member and no file. North holds an open order with a line, a paid one with a line,
 * and four tasks: the first links to the open order and its line and to Ada, the second to the paid order and its
 * line and to Cy, the third to a third order, and the fourth to nothing. South holds one order.
 */
export function seedBoard(files: Files) {
  const asSystem = writingFiles(files, board)
  const s = asSystem((db) => {
    const add = (name: string, values: Record<string, unknown>) => String(at(db, name).add(values).id)
    const ada = add('users', { name: 'Ada', salary: 5000 })
    const bob = add('users', { name: 'Bob', salary: 4000 })
    const cy = add('users', { name: 'Cy', salary: 3000 })
    const [north, south, east] = ['North', 'South', 'East'].map((name) => add('teams', { name }))
    add('members', { team: north, user: ada })
    add('members', { team: south, user: bob })
    return { ada, bob, cy, north, south, east }
  })
  const n = asSystem((db) => {
    const add = (name: string, values: Record<string, unknown>) => String(at(db, name).of(s.north).add(values).id)
    const meaning = [1, 0, 0, 0]
    const secret = add('orders', { total: 10, note: 'secret plan', cost: 7, placedBy: s.ada, meaning })
    const paid = add('orders', { total: 20, note: 'paid thing', cost: 9, status: 'paid', placedBy: s.cy, meaning })
    const third = add('orders', { total: 5, note: 'tiny', cost: 1, meaning })
    const openLine = add('lines', { order: secret, qty: 3 })
    const paidLine = add('lines', { order: paid, qty: 8 })
    const first = add('tasks', { title: 'one', order: secret, line: openLine, assignee: s.ada })
    add('tasks', { title: 'two', order: paid, line: paidLine, assignee: s.cy })
    add('tasks', { title: 'three', order: third })
    add('tasks', { title: 'four' })
    return { secret, paid, openLine, paidLine, first }
  })
  const far = asSystem((db) =>
    String(
      at(db, 'orders')
        .of(s.south)
        .add({ total: 99, note: 'south order', meaning: [0, 1, 0, 0] }).id,
    ),
  )
  return { ...s, ...n, far }
}

export type Sql = (text: string, values?: unknown[], o?: { of?: string }) => unknown[]

/** The raw SQL of a `db` with full access that reads the files. */
export const rawOf = (files: Files): Sql =>
  Reflect.get(Object(readingFiles(files, board, system, { system: true })), 'sql')

/** Carries out one write of the files with full access, handed the raw SQL and the `db` of that write. */
export const rawWrite = <T>(files: Files, work: (sql: Sql, db: object) => T): T =>
  files.write((w) => {
    const db = createDb(w, board, system, 'write', {}, { system: true })
    return work(Reflect.get(Object(db), 'sql'), db)
  }).value
