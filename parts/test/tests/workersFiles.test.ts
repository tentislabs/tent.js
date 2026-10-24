import assert from 'node:assert/strict'
import test from 'node:test'
import { beats, heavyWith, joined, system, untilAsync } from './heavyApps.ts'
import { notDropped } from './started.ts'

test('[51-4] on a worker, rows that travelled as a file, an answer of the writer past inFrame and a result past inFrame each arrive whole', async (t) => {
  const app = await heavyWith(t, '', "  limits: { inFrame: '0.3 KB' },\n")
  for (let i = 0; i < 8; i++) await app.call('addMark', { what: `a mark among many, number ${i}` }, system)
  await joined(t, app, ['gpu'])
  const rows = notDropped(await app.start('withRows', undefined, system)).run
  assert.equal(await app.runs.wait(rows), 8)
  const reads = notDropped(await app.start('readsMuch', undefined, system)).run
  assert.equal(await app.runs.wait(reads), 8)
  const answers = notDropped(await app.start('answersMuch', { n: 60 }, system)).run
  assert.equal(await app.runs.wait(answers), 'many words '.repeat(60))
})

test('[51-8] the files that a worker fetched for its tasks are held to the size of fetched/', async (t) => {
  const app = await heavyWith(t, '', "  limits: { inFrame: '0.3 KB' },\n")
  const worker = await app.worker({ kinds: ['gpu'], fetched: '4 KB' })
  t.after(() => worker.close({ now: true }).catch(() => undefined))
  await untilAsync('the worker is ready', () =>
    app.workers().some((one) => Reflect.get(Object(one), 'ready').length > 0),
  )
  for (let i = 0; i < 8; i++) await app.call('addMark', { what: `${'x'.repeat(30)} ${i}` }, system)
  const sizes: number[] = []
  for (let i = 0; i < 5; i++) {
    // Each run is handed rows of its own, past inFrame: a file of about half the size of fetched/.
    await app.call('addMark', { what: `one more, ${i}` }, system)
    const { run } = notDropped(await app.start('withRows', undefined, system))
    assert.equal(await app.runs.wait(run), 9 + i)
    sizes.push(worker.at().folder.fetched)
  }
  // The five files together are past the size: older ones were removed.
  assert.ok((sizes[0] ?? 0) * 5 > 4096)
  assert.ok(
    sizes.every((one) => one > 0 && one <= 4096),
    `held to its size: ${sizes}`,
  )
})

test('[51-8] a done of a worker past workPerMinute is sent again, and saved', async (t) => {
  const app = await heavyWith(t, '', '  limits: { workPerMinute: 1 },\n')
  await joined(t, app, ['gpu'])
  const { run } = notDropped(await app.start('answersMuch', { n: 1 }, system))
  await untilAsync('the task is out', () => app.workers().some((one) => Reflect.get(Object(one), 'working').length > 0))
  await beats(app, 62)
  assert.equal(await app.runs.wait(run), 'many words ')
})
