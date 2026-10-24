import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { App } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import type { TestClock } from '../clock.ts'
import { testClock } from '../clock.ts'
import { appIn, logLines } from './desks.ts'
import { closing, copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const
const day = 86_400_000

type Row = Record<string, unknown>

/** Every row of a table, as the system reads it, and of a tenant table the rows of one team. */
async function rowsOf(app: App, table: string, of?: string): Promise<Row[]> {
  const rows: unknown = await app.read({ from: table, ...(of ? { of } : {}), sort: [{ by: 'id' }] }, system)
  return Array.isArray(rows) ? rows : []
}

const idOf = (row: unknown): string => String(Reflect.get(Object(row), 'id'))

/** Waits until a condition holds, a few seconds at most. */
async function until(what: string, holds: () => Promise<boolean>): Promise<void> {
  for (let tries = 0; tries < 400; tries++) {
    if (await holds()) return
    await new Promise((done) => setTimeout(done, 25))
  }
  assert.fail(`never: ${what}`)
}

/** Writes old rows and young ones, with a pin on one old event and notes on others. Answers what the test reads. */
async function someRows(app: App, now: number): Promise<{ pinned: string; old: string[]; team: string }> {
  const old: string[] = []
  for (let i = 0; i < 25; i++)
    old.push(idOf(await app.call('addEvent', { at: new Date(now - 200 * day + i), kind: `old ${i}` }, system)))
  for (let i = 0; i < 5; i++) await app.call('addEvent', { at: new Date(now - 10 * day), kind: `young ${i}` }, system)
  await app.call('pin', { event: old[7] }, system)
  for (const event of old.slice(0, 4)) await app.call('note', { event, words: 'a note' }, system)
  for (let i = 0; i < 12; i++)
    await app.call('addLine', { at: new Date(now - 60 * day), level: 'info', words: `old ${i}` }, system)
  for (let i = 0; i < 3; i++)
    await app.call('addLine', { at: new Date(now - 60 * day), level: 'error', words: `error ${i}` }, system)
  for (let i = 0; i < 2; i++)
    await app.call('addLine', { at: new Date(now - day), level: 'info', words: `young ${i}` }, system)
  const team = idOf(await app.call('addTeam', { name: 'North' }, system))
  for (let i = 0; i < 4; i++) await app.call('addVisit', { team, at: new Date(now - 20 * day) }, system)
  for (let i = 0; i < 2; i++) await app.call('addVisit', { team, at: new Date(now - day) }, system)
  return { pinned: old[7], old, team }
}

test('[45-4] the daily upkeep removes the rows past their age, page by page, with what their links say and the trigger of a removal, and leaves a row that a refusing link holds, which the log names', async (t) => {
  const { app, dataFolder } = await appIn(t, copyOf(t, 'aged'))
  const now = Date.now()
  const { pinned, old, team } = await someRows(app, now)
  app.clock.advance('1 day')
  await until('the old events are removed', async () => (await rowsOf(app, 'events')).length === 6)
  const events = await rowsOf(app, 'events')
  assert.deepEqual(events.map((one) => one.kind).sort(), [
    'old 7',
    'young 0',
    'young 1',
    'young 2',
    'young 3',
    'young 4',
  ])
  assert.equal(events.find((one) => one.kind === 'old 7')?.id, pinned)
  // The notes of the removed events went with them, as their link says.
  assert.deepEqual(await rowsOf(app, 'notes'), [])
  // The trigger of a removal started for each removed event.
  await until('every removal was written down', async () => (await rowsOf(app, 'gone')).length === 24)
  const marked = (await rowsOf(app, 'gone')).map((one) => one.event).sort()
  assert.deepEqual(marked, old.filter((one) => one !== pinned).sort())
  // Only the rows that the `where` names are removed.
  const lines = await rowsOf(app, 'lines')
  assert.deepEqual(lines.map((one) => one.words).sort(), ['error 0', 'error 1', 'error 2', 'young 0', 'young 1'])
  // The file of a team is kept the same way.
  await until('the old visits are removed', async () => (await rowsOf(app, 'visits', team)).length === 2)
  // Page by page: 24 events in pages of ten.
  const removed = logLines(dataFolder, 'their table keeps them were removed').filter(
    (one) => one.data.table === 'events',
  )
  assert.equal(removed.length, 1)
  assert.deepEqual([removed[0].data.removed, removed[0].data.pages], [24, 3])
  const held = logLines(dataFolder, 'that a link holds')
  assert.deepEqual(
    held.map((one) => [one.data.table, one.data.id, one.data.by]),
    [['events', pinned, 'pins.event']],
  )
})

test('[45-4] `lasts` that is a length of time alone counts from the last write of a row: a row written since stays, and one not written for that long is removed', async (t) => {
  const project = copyOf(t, 'aged')
  const tables = join(project, 'tables', 'tables.ts')
  writeFileSync(
    tables,
    `${readFileSync(tables, 'utf8')}\nexport const drafts = table('drafts', { columns: { words: text() }, access: all, lasts: '14 days' })\n`,
  )
  const { app } = await appIn(t, project)
  const added = async (words: string): Promise<string> => {
    const rows: unknown = await app.write([{ add: 'drafts', values: { words } }], system)
    return idOf(Array.isArray(rows) ? rows[0] : undefined)
  }
  const [kept, gone] = [await added('kept'), await added('gone')]
  app.clock.advance('10 days')
  await app.write([{ change: 'drafts', id: kept, values: { words: 'kept, written again' } }], system)
  app.clock.advance('5 days')
  await until('the draft not written for 14 days is removed', async () =>
    (await rowsOf(app, 'drafts')).every((one) => one.id !== gone),
  )
  assert.deepEqual(
    (await rowsOf(app, 'drafts')).map((one) => one.id),
    [kept],
  )
})

/** Opens the project of the rows kept for a time in the mode `development`, on a clock that the test moves. */
async function inDevelopment(t: TestContext, keep: boolean): Promise<{ app: App; clock: TestClock }> {
  const project = copyOf(t, 'aged')
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  const { clock, moves } = testClock()
  const engine = createEngine({ port: 0, makers: { clock: () => clock } })
  closing(t, () => engine.close())
  const app = await engine.open(built.bundleFolder, {
    dataFolder: join(project, '.tent'),
    mode: 'development',
    ...(keep ? { keep: true } : {}),
  })
  return { app, clock: moves }
}

test('[45-4] in development nothing is removed by the time a table keeps its rows, unless `tent dev --keep` asks it', async (t) => {
  const plain = await inDevelopment(t, false)
  await someRows(plain.app, Date.now())
  plain.clock.advance('2 days')
  await new Promise((done) => setTimeout(done, 300))
  assert.equal((await rowsOf(plain.app, 'events')).length, 30)
  assert.equal((await rowsOf(plain.app, 'lines')).length, 17)

  const kept = await inDevelopment(t, true)
  await someRows(kept.app, Date.now())
  kept.clock.advance('2 days')
  await until('the old events are removed', async () => (await rowsOf(kept.app, 'events')).length === 6)
})
