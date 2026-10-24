import type { Row, Tx } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { table } from '../tables/apiKeys.ts'

const system = { kind: 'system' } as const

/** One key as the engine holds it, without its fingerprint. */
export interface KeyRow {
  id: string
  name: string
  scopes: string[]
  roles: string[]
  user?: string
  perMinute: number
  asks?: string
  rights?: string[]
  work?: unknown
  createdAt: Date
  lastUsedAt?: Date
  expiresAt?: Date
}

const textsOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A key as its row holds it. */
function keyOf(row: Row): KeyRow {
  const dates = (name: string): Date | undefined => (row[name] instanceof Date ? row[name] : undefined)
  const [lastUsedAt, expiresAt] = [dates('lastUsedAt'), dates('expiresAt')]
  return {
    id: String(row.id),
    name: String(row.name),
    scopes: textsOf(row.scopes),
    roles: textsOf(row.roles),
    ...(typeof row.user === 'string' ? { user: row.user } : {}),
    perMinute: Number(row.perMinute),
    ...(typeof row.asks === 'string' ? { asks: row.asks } : {}),
    ...(Array.isArray(row.rights) ? { rights: textsOf(row.rights) } : {}),
    ...(row.work !== undefined && row.work !== null ? { work: row.work } : {}),
    createdAt: dates('createdAt') ?? new Date(0),
    ...(lastUsedAt ? { lastUsedAt } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  }
}

/** The row of the key of an id with its fingerprint, or nothing where none is. */
export function keyAt(o: Opened, id: string, tx?: Tx): { key: KeyRow; fingerprint: string } | undefined {
  const plan = { from: table.name, one: 'get' as const, id }
  const held: unknown = tx ? tx.read(plan, system) : o.store.read(plan, system).value
  return isRow(held) ? { key: keyOf(held), fingerprint: String(held.fingerprint) } : undefined
}

/** Every key, or those made for one user, in the order they were made. */
export function keysOf(o: Opened, user?: string, tx?: Tx): KeyRow[] {
  const plan = { from: table.name, ...(user === undefined ? {} : { where: { col: 'user', is: user } }) }
  const read: unknown = tx ? tx.read(plan, system) : o.store.read(plan, system).value
  return (Array.isArray(read) ? read.filter(isRow) : [])
    .map(keyOf)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1))
}

/** Whether the keys of an app hold one of the right `work`: an app that holds one loads the link of workers. */
export const holdsWorkKeys = (o: Opened): boolean => keysOf(o).some((key) => key.rights?.includes('work'))

/** Writes a new key, with the fingerprint of its random part. */
export function addKey(tx: Tx, key: KeyRow, fingerprint: string): void {
  tx.add(table.name, { ...key, fingerprint }, system)
}

/** Removes a key. A key that is not there is no error: it is nobody either way. */
export function removeKey(tx: Tx, id: string): void {
  if (isRow(tx.read({ from: table.name, one: 'get', id }, system))) tx.remove(table.name, id, system)
}

/** Writes when a key was last used: once a minute at most. */
export function noteUse(o: Opened, key: KeyRow): void {
  const now = o.clock.now()
  if (key.lastUsedAt && now - key.lastUsedAt.getTime() < 60_000) return
  o.store.write((tx) => tx.change(table.name, key.id, { lastUsedAt: new Date(now) }, system))
}
