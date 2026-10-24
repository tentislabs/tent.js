import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import type { App } from '../index.ts'
import { bundled, codeOf, engineOf, logRows, running, send, system, testClock, workFolder } from './apps.ts'
import { addCard } from './watching.ts'

const day = 86_400_000

/** Sends a command to the admin channel of an app, as a command of this computer does, with no network. */
async function command(dataFolder: string, app: App, origin: string, name: string, args: object) {
  const token = String(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).token)
  return send(app, `${origin}/_t/admin/${name}`, {
    body: JSON.stringify({ args }),
    headers: { authorization: `Bearer ${token}` },
  })
}

/** Waits until something holds, and fails where it never does. */
async function until(what: string, holds: () => boolean): Promise<void> {
  for (let n = 0; n < 2000; n++) {
    if (holds()) return
    await new Promise((done) => setTimeout(done, 5))
  }
  assert.fail(`never: ${what}`)
}

test('[40-3b] engine.give hands the engine an admin command of a part above it: the channel carries it out for the app it was given for, under the token of the engine, and a thing of another form is T0013', async (t) => {
  const run = await running(t)
  const asked: unknown[] = []
  run.engine.give(
    'admin',
    'history',
    {
      run: (app: App, args: object) => {
        asked.push([app === run.app, args])
        return { points: 3 }
      },
    },
    run.app,
  )
  const answered = await command(run.dataFolder, run.app, run.origin, 'history', { what: 'list' })
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
  assert.deepEqual(answered.body.value, { points: 3 })
  assert.deepEqual(asked, [[true, { what: 'list' }]])
  // The command passes what every command of the channel passes: with no token it is refused, and nothing is carried out.
  const refused = await send(run.app, `${run.origin}/_t/admin/history`, { body: JSON.stringify({ args: {} }) })
  assert.equal(refused.error.code, 'T0006')
  assert.equal(asked.length, 1)
  // What a given command throws is answered as the failure of a command.
  run.engine.give('admin', 'broken', { run: () => Promise.reject(new Error('the part above failed')) })
  const failed = await command(run.dataFolder, run.app, run.origin, 'broken', {})
  assert.equal(failed.body.ok, false)
  // A command that nobody gave is not there, and a thing of another form is not taken.
  assert.equal((await command(run.dataFolder, run.app, run.origin, 'nobody-gave-this', {})).error.code, 'T0001')
  assert.throws(() => run.engine.give('admin', 'formless', { daily: () => undefined }), { code: 'T0013' })
  assert.throws(() => run.engine.give('upkeep', 'formless', { run: () => undefined }), { code: 'T0013' })
})

test('[40-3b] a share of the daily upkeep that was given is carried out when it is given, and then with each daily upkeep of its app, and what it throws is written to the log and stops nothing', async (t) => {
  const { clock, advance } = testClock()
  const run = await running(t, { engine: { makers: { clock: () => clock } } })
  let done = 0
  let failing = false
  run.engine.give(
    'upkeep',
    'history',
    {
      daily: () => {
        done++
        if (failing) throw new Error('the upkeep of the history failed')
      },
    },
    run.app,
  )
  await until('the upkeep of the opening', () => done === 1)
  advance(day - 1000)
  assert.equal(done, 1, 'nothing is due before a day has passed')
  advance(1000)
  await until('the upkeep of the first day', () => done === 2)
  failing = true
  advance(day)
  await until('the upkeep that fails', () => done === 3)
  await until('the failure in the log', () =>
    logRows(run.dataFolder, 'errors').some((row) => String(row.message).includes('the upkeep of the history failed')),
  )
  failing = false
  advance(day)
  await until('the upkeep after the failure', () => done === 4)
  // A share that was given for every app of the engine is carried out for an app that is opened later.
  let forAll = 0
  run.engine.give('upkeep', 'every', { daily: () => void forAll++ })
  await until('the share of every app, for the app that is open', () => forAll === 1)
  // After its app was closed nothing of it is carried out.
  await run.app.close()
  advance(3 * day)
  await new Promise((ended) => setTimeout(ended, 20))
  assert.deepEqual([done, forAll], [4, 1])
})

test('[40-3b] a switch with back retires what the older version does not know with no statement: no row is lost, the app runs at each version, and going forward again revives the column with its values', async (t) => {
  const work = workFolder(t)
  const first = await bundled(t, { project: 'board' }, work)
  const wider = await bundled(
    t,
    {
      project: 'board',
      change: (d: Description) => {
        Object.assign(Object(d.tables.cards.columns), { colour: { kind: 'text', optional: true } })
        d.tables.labels = { columns: { name: { kind: 'text' } }, access: { read: { rule: 'anyone', why: 'open' } } }
      },
    },
    work,
  )
  const engine = engineOf(t)
  const dataFolder = join(work, 'data')
  const app = await engine.open(first.folder, { dataFolder, mode: 'development' })
  const one = await addCard(app, 'a', 1)
  await app.switch(await app.add(wider.folder))
  await app.write(
    [
      { change: 'cards', id: one, values: { colour: 'red' } },
      { add: 'labels', values: { name: 'urgent' } },
    ],
    { as: system },
  )
  const titles = async (): Promise<unknown> =>
    Object(await app.call('allCards', {}, { as: system })).map((row: { title: string }) => row.title)

  // Without `back` the older version is refused: a column that is gone with no statement is no table change.
  const older = await app.add(first.folder)
  assert.match(String(await codeOf(app.switch(older))), /^T200[2-4]$/)
  assert.equal(app.versions().find((version) => version.running)?.id, wider.versionId)
  // With `back` what was added since is retired, and nothing is dropped.
  const back = await app.switch(older, { back: true })
  assert.deepEqual(back.steps.map((step) => step.do).sort(), ['retireColumn', 'retireTable'])
  assert.deepEqual(await titles(), ['a'])
  await addCard(app, 'b', 2)
  assert.deepEqual(await titles(), ['a', 'b'], 'the app runs at the older version')
  // Forward again: the column and the table are revived with their values.
  const forward = await app.switch(await app.add(wider.folder))
  assert.deepEqual(forward.steps.map((step) => step.do).sort(), ['reviveColumn', 'reviveTable'])
  const rows = Object(await app.read({ from: 'cards', sort: [{ by: 'rank' }] }, { as: system }))
  assert.deepEqual(
    rows.map((row: Record<string, unknown>) => [row.title, row.colour ?? null]),
    [
      ['a', 'red'],
      ['b', null],
    ],
  )
  assert.deepEqual(
    Object(await app.read({ from: 'labels' }, { as: system })).map((row: Record<string, unknown>) => row.name),
    ['urgent'],
  )
})
