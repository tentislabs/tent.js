import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyChange, changesTable, connected, hereTable, keptChanges, sqliteStore } from '../../data/index.ts'
import type { Store } from '../../data/index.ts'
import { runsTable, scheduleTable, stepsTable } from '../index.ts'
import { atEnd } from './bench.ts'

const system = { kind: 'system' } as const

// The columns of each run table, in the words of the table of the engine's own tables: a time, a whole number
// and a `json` are named there, and every other column is text.
const times = ['wakeAt', 'createdAt', 'endedAt', 'startedAt', 'nextAt']
const wholes = ['repeat', 'size', 'tries', 'workedMs']
const jsons = [
  ...['input', 'event', 'startedBy', 'parentStep', 'answer', 'error', 'used', 'given', 'result', 'show'],
  ...['ask', 'agreed', 'waitsFor', 'out', 'away', 'progress', 'many'],
]

const kindOf = (name: string): string =>
  times.includes(name) ? 'date' : wholes.includes(name) ? 'number' : jsons.includes(name) ? 'json' : 'text'

test('[16-4@7b] the three run tables exist in code with exactly their columns and their keys', () => {
  const asked = {
    _t_runs: {
      key: ['id'],
      columns: [
        ...['id', 'flow', 'kind', 'version', 'state', 'input', 'event', 'startedBy', 'as', 'parent', 'parentStep'],
        ...['top', 'leave', 'thread', 'given', 'wakeAt', 'answer', 'error', 'used', 'workedMs', 'createdAt', 'endedAt'],
        ...['key', 'from', 'trace'],
      ],
    },
    _t_steps: {
      key: ['run', 'name', 'repeat'],
      columns: [
        ...['run', 'name', 'repeat', 'state', 'result', 'size', 'error', 'show', 'ask', 'agreed', 'waitsFor'],
        ...['wakeAt', 'tries', 'startedAt', 'endedAt', 'out', 'away', 'progress', 'many'],
      ],
    },
    _t_schedule: { key: ['flow', 'trigger'], columns: ['flow', 'trigger', 'nextAt'] },
  }
  for (const table of [runsTable, stepsTable, scheduleTable]) {
    const { key, columns } = Object(asked)[table.name]
    assert.deepEqual(Object.keys(table.columns), columns, `${table.name} holds exactly its columns`)
    assert.deepEqual(table.key, key, `${table.name} has its key`)
    for (const [name, type] of Object.entries(table.columns)) {
      assert.equal(type.kind, kindOf(name), `${table.name}.${name}`)
      if (wholes.includes(name))
        assert.equal(Reflect.get(type, 'whole'), true, `${table.name}.${name} is a whole number`)
    }
    assert.equal(table.own, undefined, `${table.name} is no table of one machine alone`)
  }
  // The runner finds its next wake by an index over the state and the wake time of a run, and the runs of a key by
  // one over the flow and the key.
  assert.deepEqual(runsTable.indexes, [
    ['state', 'wakeAt'],
    ['flow', 'key'],
  ])
})

/** Opens a store in memory that holds the run tables and the tables that a machine keeps for itself. */
function machine(t: Parameters<typeof atEnd>[0]): Store {
  const store = sqliteStore()
  store.open(':memory:')
  atEnd(t, () => store.close())
  store.write(() =>
    store.applyTableChanges(
      [hereTable, changesTable, runsTable, stepsTable, scheduleTable].map((layout) => ({
        do: 'addTable' as const,
        table: layout.name,
        layout,
      })),
    ),
  )
  return store
}

test('[16-4@7b] a row written to each run table reaches a second store through `applyChange`', (t) => {
  const reader = machine(t)
  const writer = connected(machine(t), [hereTable, changesTable, runsTable, stepsTable, scheduleTable], { keep: true })
  const at = new Date(Date.UTC(2026, 0, 1))
  writer.write((tx) => {
    tx.add(
      runsTable.name,
      { id: 'r1', flow: 'welcome', kind: 'flow', version: 'v1', state: 'waiting', as: 'system', top: 'r1', wakeAt: at },
      system,
    )
    tx.add(stepsTable.name, { run: 'r1', name: 'wait', repeat: 1, state: 'waiting', size: 0, wakeAt: at }, system)
    tx.add(scheduleTable.name, { flow: 'welcome', trigger: '0', nextAt: at }, system)
  })
  for (const change of keptChanges(writer, 0)) applyChange(reader, change)
  const read = (from: string): unknown => reader.read({ from }, system).value
  assert.deepEqual(read(runsTable.name), [
    { id: 'r1', flow: 'welcome', kind: 'flow', version: 'v1', state: 'waiting', as: 'system', top: 'r1', wakeAt: at },
  ])
  assert.deepEqual(read(stepsTable.name), [
    { run: 'r1', name: 'wait', repeat: 1, state: 'waiting', size: 0, wakeAt: at },
  ])
  assert.deepEqual(read(scheduleTable.name), [{ flow: 'welcome', trigger: '0', nextAt: at }])
})
