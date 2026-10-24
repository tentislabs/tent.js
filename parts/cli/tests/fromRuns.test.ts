import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { copied, root, typed } from './typed.ts'
import { notDropped } from './started.ts'

/** Waits until a run has ended. */
async function ended(app: { runs: { read(run: string): { state: string } | undefined } }, run: string): Promise<void> {
  const until = performance.now() + 20_000
  while (!['done', 'failed', 'stopped'].includes(String(app.runs.read(run)?.state))) {
    assert.ok(performance.now() < until, 'the run never ended')
    await new Promise<void>((done) => setTimeout(done, 5))
  }
}

test('[47-9] [15-6@10g] `tent test --ai --from-runs` writes the kept runs of an agent that were rated low as a file of evals', async (t) => {
  // The engine is closed before the folder of the copy is taken away: its data file is open until then.
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const project = copied(t, 'from-runs', join(root, 'parts', 'ai', 'tests', 'rated'))
  const made = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error'),
    [],
  )
  const data = join(project, '..', 'data')
  const app = await engine.open(made.bundleFolder, { dataFolder: data, mode: 'test' })
  const [maya] = Object(await app.write([{ add: 'users', values: { name: 'Maya', roles: [] } }], { as: 'system' }))
  const as = { as: { kind: 'user' as const, user: { id: String(maya.id), roles: [] } } }
  const said = ['Where is my order?', 'Can I pay later?', 'Thanks.']
  const started: string[] = []
  for (const message of said) {
    const { run } = notDropped(await app.start('quiet', { message }, as))
    await ended(app, run)
    started.push(run)
  }
  // Two runs were rated low, and one high.
  await app.call('rateByMail', { run: started[0], score: '1' }, as)
  await app.call('rateByMail', { run: started[1], score: '2' }, as)
  await app.call('rateByMail', { run: started[2], score: '5' }, as)
  const asked = await typed(project, 'test', '--ai', '--from-runs', 'quiet', '--below', '3', '--data', data, '--json')
  assert.equal(asked.ended, 0, asked.printed)
  const file = String(Reflect.get(Object(asked.answer.value), 'file'))
  assert.equal(file, 'tests/quiet.runs.ai.ts')
  assert.deepEqual(Reflect.get(Object(asked.answer.value), 'cases'), 2)
  const written = readFileSync(join(project, file), 'utf8')
  assert.match(written, /Where is my order\?/)
  assert.match(written, /Can I pay later\?/)
  assert.doesNotMatch(written, /Thanks\./, 'a run rated high is no case')
  assert.match(written, /evals\(app, 'quiet'/)
  for (const run of started.slice(0, 2)) assert.match(written, new RegExp(run))
})
