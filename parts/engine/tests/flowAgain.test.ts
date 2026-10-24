import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { App } from '../index.ts'
import { addUser, bundled, codeOf, engineOf, portOf, send, system, testClock, workFolder } from './apps.ts'
import { flowing, marksOf, untilWithin, untilState } from './flowing.ts'
import { notDropped } from './started.ts'

const project = 'renewing'

test('[46-6] `step.again`: a run that renews a hundred times keeps one run at a time, each with `from` naming the run before, its key and its starter, and none meets `limits.steps`', async (t) => {
  const { app, engine } = await flowing(t, { project })
  const unfinished: number[] = []
  // Each time a step is done, no more than one run of the flow has not ended.
  engine.on('step.done', (told) => {
    if (told.flow === 'renew')
      unfinished.push(app.runs.find({ flow: 'renew', states: ['queued', 'running', 'waiting'] }).length)
  })
  const first = notDropped(await app.start('renew', { n: 0 }, { as: system })).run
  await untilWithin(
    () => {
      const all = app.runs.find({ flow: 'renew' })
      return all.length === 101 && all.every((run) => run.state === 'done')
    },
    'the hundredth renewal ended',
    60_000,
  )
  // The runs in the order they renewed: each names the run before it as `from`.
  const found = app.runs.find({ flow: 'renew' })
  const runs = found.filter((run) => run.id === first)
  for (let n = 1; n <= 100; n += 1) runs.push(...found.filter((run) => run.from === runs[n - 1]?.id))
  assert.equal(runs.length, 101, 'one run renews each run before it')
  for (const [n, run] of runs.entries()) {
    assert.deepEqual(run.input, { n })
    assert.equal(run.key, 'subscription')
    assert.deepEqual(run.startedBy, { kind: 'system' })
    assert.equal(run.from, n === 0 ? undefined : runs[n - 1].id, `the renewal ${n} names the run before`)
    assert.deepEqual(
      run.steps.map((step) => step.name),
      n === 100 ? ['bill'] : ['bill', 'again'],
      'nothing of the saved steps is carried over',
    )
  }
  assert.equal(await app.runs.wait(runs[100].id), 100)
  assert.ok(unfinished.length >= 101 && unfinished.every((count) => count === 1), JSON.stringify(unfinished))
  assert.equal((await marksOf(app)).length, 101, 'each renewal billed once')
})

/** Opens the project with a key of the secrets in its data folder, on a clock that the test moves. */
async function sealedApp(t: TestContext) {
  const work = workFolder(t)
  const bundle = await bundled(t, { project }, work)
  const dataFolder = join(work, 'data')
  mkdirSync(dataFolder, { recursive: true })
  writeFileSync(join(dataFolder, 'secret.key'), `${randomBytes(32).toString('base64')}\n`)
  const { clock, advance } = testClock()
  const app = await engineOf(t, { makers: { clock: () => clock } }).open(bundle.folder, { dataFolder, mode: 'test' })
  return { app, dataFolder, advance }
}

/** The saved result of a step as the data file holds it, read by a program that holds no key. */
function storedResult(dataFolder: string, run: string, step: string): string {
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    const row = data.prepare('SELECT result FROM "_t_steps" WHERE run = ? AND name = ?').get(run, step)
    return String(row?.result)
  } finally {
    data.close()
  }
}

/** Sends a command to the admin channel of an app, as a command of this computer does, and answers its value. */
async function did(app: App, dataFolder: string, name: string, args: object): Promise<Record<string, unknown>> {
  const token = String(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).token)
  const answered = await send(app, `http://localhost:${portOf(dataFolder)}/_t/admin/${name}`, {
    body: JSON.stringify({ args }),
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
  return Object(answered.body.value)
}

test("[46-8] a sealed step result is sealed in `_t_steps` and opened when its run reads it; another run and whoever reads the file without the key read only the sealed text; a person's export opens it for them", async (t) => {
  const { app, dataFolder, advance } = await sealedApp(t)
  const ada = await addUser(app, 'Ada')
  const run = notDropped(await app.start('charge', { card: '4242-secret' }, { as: ada })).run
  await untilState(app, run, 'waiting')

  const stored = storedResult(dataFolder, run, 'card')
  assert.doesNotMatch(stored, /4242/, 'the data file holds the sealed text alone')
  assert.match(stored, /tent\.sealed/)
  const shown = app.runs.read(run)?.steps.find((step) => step.name === 'card')?.result
  assert.doesNotMatch(JSON.stringify(shown), /4242/, 'whoever reads the run is shown the sealed text')

  // The sealed text of one run, put into the step of another, does not open: it is bound to its run.
  const other = notDropped(await app.start('charge', { card: 'other' }, { as: ada })).run
  await untilState(app, other, 'waiting')
  const data = new DatabaseSync(join(dataFolder, 'data.db'))
  try {
    data.prepare('UPDATE "_t_steps" SET result = ? WHERE run = ? AND name = ?').run(stored, other, 'card')
  } finally {
    data.close()
  }

  advance(3_600_000)
  await untilState(app, run, 'done')
  assert.ok((await marksOf(app)).includes('charged 4242-secret'), 'the run reads its sealed result back, opened')
  await untilState(app, other, 'failed')
  assert.equal(await codeOf(app.runs.wait(other)), 'T0019')

  const exported = await did(app, dataFolder, 'data', { what: 'user', do: 'export', id: String(ada.user?.id) })
  const theirs = Object(exported.runs).find((one: { id: string }) => one.id === run)
  assert.deepEqual(
    theirs.steps.find((step: { name: string }) => step.name === 'card').result,
    { card: '4242-secret' },
    "the person's export opens it",
  )

  // A flow that states `sealed` seals every step of it.
  const whole = notDropped(await app.start('sealedWhole', { word: 'hidden-word' }, { as: system })).run
  assert.equal(await app.runs.wait(whole), 'hidden-word')
  assert.doesNotMatch(storedResult(dataFolder, whole, 'word'), /hidden-word/)
})
