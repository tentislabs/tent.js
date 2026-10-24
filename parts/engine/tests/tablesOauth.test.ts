import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Store } from '../../data/index.ts'
import { applyChange, changesTable, connected, hereTable, keptChanges, sqliteStore } from '../../data/index.ts'
import { table as oauth } from '../tables/oauth.ts'

const system = { kind: 'system' } as const

/** Opens a store in memory that holds the table of grants and the tables that a machine keeps for itself. */
function machine(t: { after(fn: () => void): void }): Store {
  const store = sqliteStore()
  store.open(':memory:')
  t.after(() => store.close())
  store.write(() =>
    store.applyTableChanges(
      [hereTable, changesTable, oauth].map((layout) => ({ do: 'addTable' as const, table: layout.name, layout })),
    ),
  )
  return store
}

test('[16-4@9b] `_t_oauth` exists in code with exactly its columns and its key, and a row of it reaches a second store through `applyChange`', (t) => {
  assert.equal(oauth.name, '_t_oauth')
  assert.deepEqual(Object.keys(oauth.columns), [
    'id',
    'user',
    'client',
    'name',
    'resource',
    'scopes',
    'access',
    'refresh',
    'refreshBefore',
    'renewedAt',
    'reusedAt',
    'for',
    'accessExpiresAt',
    'createdAt',
    'usedAt',
    'expiresAt',
  ])
  assert.deepEqual(oauth.key, ['id'])
  assert.equal(oauth.own, undefined, 'it is no table of one machine alone')
  const reader = machine(t)
  const writer = connected(machine(t), [hereTable, changesTable, oauth], { keep: true })
  const at = new Date(Date.UTC(2026, 0, 1))
  const row = {
    id: '01hx0000000000000000000000',
    user: '01hx0000000000000000000001',
    client: 'https://chat.example/client.json',
    name: 'Chat',
    resource: 'https://shop.example/mcp',
    scopes: ['read'],
    access: 'a fingerprint',
    refresh: 'another fingerprint',
    for: 'mcp',
    accessExpiresAt: at,
    createdAt: at,
    usedAt: at,
    expiresAt: at,
  }
  writer.write((tx) => tx.add('_t_oauth', row, system))
  for (const change of keptChanges(writer, 0)) applyChange(reader, change)
  assert.deepEqual(reader.read({ from: '_t_oauth' }, system).value, [row])
})
