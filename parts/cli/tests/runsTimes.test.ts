import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { boolean, list, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import { createEngine } from '../../engine/index.ts'
import { copied, typed } from './typed.ts'

const timed = object({ flow: text(), times: list(text()), runs: list(text()), done: boolean() })

test('[46-7] `tent run --times` that would start more than 100 runs lists the times and starts nothing without `--yes`, and starts them with it', async (t) => {
  // The engine is closed before the folder of the copy is removed: the hooks of a test run in their order.
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const project = copied(t, 'runs-times-many', 'flowJobs')
  const made = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error'),
    [],
  )
  const data = join(project, '..', 'data')
  const app = await engine.open(made.bundleFolder, { dataFolder: data, mode: 'test' })
  const runs = async (...words: string[]): Promise<Record<string, unknown>> => {
    const asked = await typed(project, 'run', ...words, '--data', data, '--json')
    assert.equal(asked.ended, 0, asked.printed)
    assert.deepEqual(checkValue(timed, asked.answer.value), [], `the shape of tent run ${words.join(' ')}`)
    return Object(asked.answer.value)
  }
  // Two days of a quarter of an hour: some two hundred times.
  const days = ['2031-01-01T00:00:00.000Z', '2031-01-03T00:00:00.000Z']
  const held = await runs('often', '--times', days[0], days[1])
  const times = Array.isArray(held.times) ? held.times.length : 0
  assert.ok(times > 100 && times < 200, String(times))
  assert.deepEqual([held.runs, held.done], [[], false], 'more than 100 runs are not started without --yes')
  assert.equal(app.runs.find({ flow: 'often' }).length, 0)
  const started = await runs('often', '--times', days[0], days[1], '--yes')
  assert.equal(Array.isArray(started.runs) ? started.runs.length : 0, times)
  assert.equal(started.done, true)
})
