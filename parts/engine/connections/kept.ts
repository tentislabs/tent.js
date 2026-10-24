import type { Tokens } from '../../connect/index.ts'
import type { Row, Tx } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { table } from '../tables/connections.ts'
import { secretKeyAt, noKeyAtHand } from '../values/key.ts'
import { openText, sealText } from '../values/sealing.ts'

const system = { kind: 'system' } as const

/** One connection as a program reads it: its service, account, scopes and when it was made. */
export interface KeptConnections {
  service: string
  user: string
  account: string
  scopes: string[]
  at: Date
}

/** What the tokens of a connection are bound to, so a row copied to another user, service or mode opens nothing. */
const boundOf = (o: Opened, service: string, user: string): string =>
  `tent.connections/1\n${o.mode}\n${service}\n${user}`

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The rows of the connections that a read answers. */
const rowsOf = (read: unknown): Row[] => (Array.isArray(read) ? read.filter(isRow) : [])

/** A connection as a row holds it. */
const keptOf = (row: Row): KeptConnections => ({
  service: String(row.service),
  user: String(row.user),
  account: String(row.account ?? ''),
  scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
  at: row.createdAt instanceof Date ? row.createdAt : new Date(Number(row.createdAt ?? 0)),
})

/**
 * Takes an app, and where its write is open, the write. Answers the connections of one user, or of every user, as
 * the store holds them now.
 */
export function connectionsOf(o: Opened, which: { user?: string; tx?: Tx } = {}): KeptConnections[] {
  const plan = { from: table.name, ...(which.user === undefined ? {} : { where: { col: 'user', is: which.user } }) }
  const read: unknown = which.tx ? which.tx.read(plan, system) : o.store.read(plan, system).value
  return rowsOf(read).map(keptOf)
}

/**
 * Takes an app, a service, a user and an account. Answers the tokens of that connection, opened under the key of
 * the secrets, or nothing where there is none or it does not open: a row that was copied opens nothing.
 */
export function tokensOf(o: Opened, service: string, user: string, account: string): Tokens | undefined {
  const row: unknown = o.store.read({ from: table.name, one: 'get', id: { service, user, account } }, system).value
  if (!isRow(row) || typeof row.tokens !== 'string') return undefined
  const key = secretKeyAt(o.dataFolder)
  const text = key ? openText(key, row.tokens, boundOf(o, service, user)) : undefined
  if (text === undefined) return undefined
  try {
    const tokens: Tokens = JSON.parse(text)
    return tokens
  } catch {
    return undefined
  }
}

/**
 * Takes an app, a service, a user, an account and its tokens. Writes the connection, its tokens encrypted under
 * the key of the secrets, in a write of its own or in the write that is open; nothing for tokens removes it. Throws
 * T0019 with no key at hand.
 */
export function writeTokens(
  o: Opened,
  where: { service: string; user: string; account: string },
  tokens: Tokens | undefined,
  tx?: Tx,
): void {
  const id = { ...where }
  const work = (open: Tx): void => {
    const held = open.read({ from: table.name, one: 'get', id }, system)
    if (!tokens) {
      if (held !== undefined && held !== null) open.remove(table.name, id, system)
      return
    }
    const key = secretKeyAt(o.dataFolder)
    if (!key) throw noKeyAtHand('A connection to a service')
    const now = new Date(o.clock.now())
    const values = {
      tokens: sealText(key, JSON.stringify(tokens), boundOf(o, where.service, where.user)),
      scopes: tokens.scopes,
      ...(tokens.expiresAt === undefined ? {} : { expiresAt: new Date(tokens.expiresAt) }),
      updatedAt: now,
    }
    if (held !== undefined && held !== null) open.change(table.name, id, values, system)
    else open.add(table.name, { ...id, ...values, createdAt: now }, system)
  }
  if (tx) work(tx)
  else o.store.write((open) => work(open))
}
