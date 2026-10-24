import assert from 'node:assert/strict'
import test from 'node:test'
import { askerOfApp, factsOf } from '../index.ts'
import { folderOf, started } from './server.ts'

const system = { as: { kind: 'system' } } as const
const day = 86_400_000

const idOf = (row: unknown): string => String(Reflect.get(Object(row), 'id'))

test('[45-4] [44-2] the facts of an impact count the rows that the first pass of a `lasts` that is new or changed removes, but a row that a refusing link holds and one that its `where` leaves', async (t) => {
  const { app } = await started(t, folderOf(t), { mode: 'test', project: 'aged' })
  const now = Date.now()
  const old: string[] = []
  for (let i = 0; i < 6; i++)
    old.push(idOf(await app.call('addEvent', { at: new Date(now - 50 * day), kind: `old ${i}` }, system)))
  for (let i = 0; i < 2; i++) await app.call('addEvent', { at: new Date(now - 10 * day), kind: `young ${i}` }, system)
  await app.call('pin', { event: old[2] }, system)
  for (let i = 0; i < 4; i++)
    await app.call('addLine', { at: new Date(now - 20 * day), level: 'info', words: `old ${i}` }, system)
  await app.call('addLine', { at: new Date(now - 20 * day), level: 'error', words: 'an error' }, system)
  const live = app.description
  const tables = structuredClone(live.tables)
  // Events now last 40 days, and lines 15: both are changed. Visits, which stay as they were, are not counted.
  Reflect.set(Object(tables.events), 'lasts', { ...Object(Object(tables.events).lasts), for: 40 * day })
  Reflect.set(Object(tables.lines), 'lasts', { ...Object(Object(tables.lines).lasts), for: 15 * day })
  const facts = await factsOf(askerOfApp(app), live, { ...live, tables })
  assert.deepEqual(facts.kept, { events: 5, lines: 4 })
  assert.ok(!Object.hasOwn(facts.kept ?? {}, 'visits'))
})
