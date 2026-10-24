import type { Row, StorePlan, Tx } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { table } from '../tables/oauth.ts'

const system = { kind: 'system' } as const

/** One grant as its row holds it, with the fingerprints of its tokens. */
export interface GrantRow {
  id: string
  user: string
  client: string
  name: string
  // The address the token was given for: of `/mcp`, or of the app.
  resource: string
  scopes: string[]
  access: string
  refresh: string
  refreshBefore?: string
  renewedAt?: Date
  reusedAt?: Date
  for: 'mcp' | 'app'
  accessExpiresAt: Date
  createdAt: Date
  usedAt: Date
  expiresAt: Date
}

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A grant as its row holds it. */
function grantOf(row: Row): GrantRow {
  const date = (name: string): Date | undefined => (row[name] instanceof Date ? row[name] : undefined)
  const [renewedAt, reusedAt] = [date('renewedAt'), date('reusedAt')]
  return {
    id: String(row.id),
    user: String(row.user),
    client: String(row.client),
    name: String(row.name),
    resource: String(row.resource),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    access: String(row.access),
    refresh: String(row.refresh),
    ...(typeof row.refreshBefore === 'string' ? { refreshBefore: row.refreshBefore } : {}),
    ...(renewedAt ? { renewedAt } : {}),
    ...(reusedAt ? { reusedAt } : {}),
    for: row.for === 'app' ? 'app' : 'mcp',
    accessExpiresAt: date('accessExpiresAt') ?? new Date(0),
    createdAt: date('createdAt') ?? new Date(0),
    usedAt: date('usedAt') ?? new Date(0),
    expiresAt: date('expiresAt') ?? new Date(0),
  }
}

/** Reads through the write that is open, or the store of the app. */
const readIn = (o: Opened, tx: Tx | undefined, plan: StorePlan): unknown =>
  tx ? tx.read(plan, system) : o.store.read(plan, system).value

/** The grant of an id that stands, or nothing where none is or its time is up. */
export function grantAt(o: Opened, id: string, tx?: Tx): GrantRow | undefined {
  const held = readIn(o, tx, { from: table.name, one: 'get', id })
  const grant = isRow(held) ? grantOf(held) : undefined
  return grant && grant.expiresAt.getTime() > o.clock.now() ? grant : undefined
}

/** The grants that stand, of one user or of all, the oldest first. */
export function grantsOf(o: Opened, user?: string, tx?: Tx): GrantRow[] {
  const read = readIn(o, tx, { from: table.name, ...(user === undefined ? {} : { where: { col: 'user', is: user } }) })
  const now = o.clock.now()
  return (Array.isArray(read) ? read.filter(isRow) : [])
    .map(grantOf)
    .filter((one) => one.expiresAt.getTime() > now)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1))
}

/** Writes a new grant. */
export function addGrant(tx: Tx, grant: GrantRow): void {
  tx.add(table.name, { ...grant }, system)
}

/** Writes what changed of a grant. */
export function changeGrant(tx: Tx, id: string, values: Partial<GrantRow>): void {
  tx.change(table.name, id, values, system)
}

/** Removes a grant: its tokens are nobody from then on. A grant that is not there is no error. */
export function removeGrant(tx: Tx, id: string): void {
  if (isRow(tx.read({ from: table.name, one: 'get', id }, system))) tx.remove(table.name, id, system)
}

/** Takes the write of a person's removal and the id of the person, and removes every grant they gave. */
export function forgetGrants(tx: Tx, user: string): void {
  const read = tx.read({ from: table.name, where: { col: 'user', is: user } }, system)
  for (const row of Array.isArray(read) ? read.filter(isRow) : []) tx.remove(table.name, String(row.id), system)
}

/** Removes every grant whose time is up. A reader removes none: its writer does. */
export function sweepGrants(o: Opened): void {
  if (o.machine.reader) return
  const now = o.clock.now()
  const read = o.store.read({ from: table.name }, system).value
  const over = (Array.isArray(read) ? read.filter(isRow) : [])
    .map(grantOf)
    .filter((one) => one.expiresAt.getTime() <= now)
  if (over.length) o.store.write((tx) => over.map((one) => tx.remove(table.name, one.id, system)))
}
