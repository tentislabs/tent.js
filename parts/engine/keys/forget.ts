import type { Tx } from '../../data/index.ts'
import { table as apiKeys } from '../tables/apiKeys.ts'
import { table as connections } from '../tables/connections.ts'

const system = { kind: 'system' } as const

/**
 * Takes the write of a person's removal and the id of the person. Removes the keys that were made for them, and
 * their connections to services, with the tokens they hold: neither may outlive the person.
 */
export function forgetKeysAndConnections(tx: Tx, user: string): void {
  const rowsOf = (from: string): Record<string, unknown>[] => {
    const read: unknown = tx.read({ from, where: { col: 'user', is: user } }, system)
    return Array.isArray(read) ? read.filter((one) => typeof one === 'object' && one !== null) : []
  }
  for (const row of rowsOf(apiKeys.name)) tx.remove(apiKeys.name, String(row.id), system)
  for (const row of rowsOf(connections.name))
    tx.remove(connections.name, { service: String(row.service), user, account: String(row.account) }, system)
}
