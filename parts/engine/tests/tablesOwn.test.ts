import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Store, TableLayout } from '../../data/index.ts'
import { applyChange, changesTable, connected, hereTable, keptChanges, sqliteStore } from '../../data/index.ts'
import { logTables } from '../log/tables.ts'
import { table as apiKeys } from '../tables/apiKeys.ts'
import { table as connections } from '../tables/connections.ts'
import { table as once } from '../tables/once.ts'

const system = { kind: 'system' } as const

// Each table of the engine's own for keys, connections and the calls made once, with its columns and its key, as the table of 16 names them.
const asked: Record<string, { key: string[]; columns: string[] }> = {
  _t_once: { key: ['caller', 'key'], columns: ['caller', 'key', 'run', 'at', 'result', 'places'] },
  _t_api_keys: {
    key: ['id'],
    columns: [
      ...['id', 'fingerprint', 'name', 'scopes', 'roles', 'user', 'perMinute', 'asks', 'work', 'rights'],
      ...['createdAt', 'lastUsedAt', 'expiresAt'],
    ],
  },
  _t_connections: {
    key: ['service', 'user', 'account'],
    columns: ['service', 'user', 'account', 'tokens', 'scopes', 'expiresAt', 'createdAt', 'updatedAt'],
  },
}

const tables: TableLayout[] = [once, apiKeys, connections]

/** Opens a store in memory that holds the three tables and the tables that a machine keeps for itself. */
function machine(t: { after(fn: () => void): void }): Store {
  const store = sqliteStore()
  store.open(':memory:')
  t.after(() => store.close())
  store.write(() =>
    store.applyTableChanges(
      [hereTable, changesTable, ...tables].map((layout) => ({ do: 'addTable' as const, table: layout.name, layout })),
    ),
  )
  return store
}

test('[16-4@8a] `_t_once`, `_t_api_keys`, `_t_connections` and the log table `outgoing` exist in code with exactly their columns and their keys', () => {
  for (const table of tables) {
    assert.deepEqual(Object.keys(table.columns), asked[table.name].columns, `${table.name} holds exactly its columns`)
    assert.deepEqual(table.key, asked[table.name].key, `${table.name} has its key`)
    assert.equal(table.own, undefined, `${table.name} is no table of one machine alone`)
  }
  assert.equal(apiKeys.columns.work.kind, 'json')
  assert.equal(connections.columns.tokens.kind, 'text')
  // The table of the log of what went out.
  assert.deepEqual(Object.keys(logTables.outgoing), [
    'at',
    'service',
    'call',
    'status',
    'ms',
    'run',
    'trace',
    'span',
    'parent',
  ])
})

test('[16-4@8a] a row written to each of the three tables reaches a second store through `applyChange`', (t) => {
  const reader = machine(t)
  const writer = connected(machine(t), [hereTable, changesTable, ...tables], { keep: true })
  const at = new Date(Date.UTC(2026, 0, 1))
  const rows: Record<string, Record<string, unknown>> = {
    _t_once: { caller: 'incoming:stripeEvents', key: 'evt_1', run: '', at },
    _t_api_keys: {
      id: '01m4vne21rehxa0vhe4ztfk1qx',
      fingerprint: 'f'.repeat(64),
      name: 'reports',
      scopes: ['totals'],
      roles: ['staff'],
      perMinute: 120,
      createdAt: at,
    },
    _t_connections: {
      service: 'github',
      user: 'u1',
      account: '',
      tokens: 'sealed',
      scopes: ['repo'],
      createdAt: at,
      updatedAt: at,
    },
  }
  writer.write((tx) => {
    for (const [name, row] of Object.entries(rows)) tx.add(name, row, system)
  })
  for (const change of keptChanges(writer, 0)) applyChange(reader, change)
  for (const [name, row] of Object.entries(rows))
    assert.deepEqual(reader.read({ from: name }, system).value, [row], name)
})
