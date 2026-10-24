import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Type } from '../../core/index.ts'
import { boolean, json, list, number, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import { createEngine } from '../../engine/index.ts'
import { copied, typed } from './typed.ts'
import { notDropped } from './started.ts'

const system = { as: 'system' } as const

const span: Type = object({
  span: text({ pattern: '^[0-9a-f]{16}$' }),
  parent: text({ optional: true }),
  name: text(),
  kind: text(),
  at: number(),
  ms: number(),
  ok: boolean(),
  code: text({ optional: true }),
  facts: json(),
  machine: text(),
  slowest: boolean(),
  under: list(json()),
  rows: list(json()),
})

// What `tent logs --trace` and `tent logs --slow` print with `--json`, as their value.
const shapes: Record<string, Type> = {
  trace: object({ trace: text({ pattern: '^[0-9a-f]{32}$' }), spans: list(span) }),
  slow: object({
    // The slow queries of the time, beside the slowest traces.
    slow: list(json()),
    traces: list(
      object({
        trace: text({ pattern: '^[0-9a-f]{32}$' }),
        name: text(),
        kind: text(),
        at: number(),
        ms: number(),
        ok: boolean(),
      }),
    ),
  }),
}

test('[44-1] tent runs show names the trace of a run, tent logs --trace prints its tree with the slowest path marked, and tent logs --slow lists the slowest traces beside the slow queries', async (t) => {
  // The engine is closed before the folder of its data is removed: the hooks of a test run in their order.
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const project = copied(t, 'trace-logs', 'flowShop')
  const made = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error'),
    [],
  )
  const data = join(project, '..', 'data')
  const app = await engine.open(made.bundleFolder, { dataFolder: data, mode: 'test' })
  const { run } = notDropped(await app.start('bigOrder', { title: 'desk' }, system))
  const ends = performance.now() + 20_000
  while (app.runs.read(run)?.state !== 'waiting') {
    assert.ok(performance.now() < ends, 'the run waits for its yes')
    await new Promise<void>((done) => setTimeout(done, 2))
  }
  const value = async (...words: string[]): Promise<Record<string, unknown>> => {
    const asked = await typed(project, ...words, '--data', data, '--json')
    assert.equal(asked.ended, 0, asked.printed)
    return Object(asked.answer.value)
  }

  // The run names the trace that holds it.
  const shown = await value('runs', 'show', run)
  const trace = String(shown.trace)
  assert.match(trace, /^[0-9a-f]{32}$/)

  // Its tree: the run at the top, its first step under it, each with its length and its outcome.
  const tree = await value('logs', '--trace', trace)
  assert.deepEqual(checkValue(shapes.trace, tree), [])
  const [top] = Object(tree.spans)
  assert.deepEqual([top.kind, top.name, top.slowest], ['run', 'bigOrder', true])
  assert.ok(top.under.some((one: { kind: string; name: string }) => one.kind === 'step' && one.name === 'tell sales'))
  // As text, a span on a line with its length and its outcome, and the slowest path marked.
  const printed = (await typed(project, 'logs', '--trace', trace, '--data', data)).printed
  assert.match(printed, new RegExp(`^trace ${trace}`))
  assert.match(printed, /\nrun bigOrder {2}\d+ ms {2}ok \*/)
  assert.match(printed, /\n {2}step tell sales {2}\d+ ms {2}ok/)
  // A trace that is not kept is T0001.
  const missing = await typed(project, 'logs', '--trace', 'f'.repeat(32), '--data', data, '--json')
  assert.deepEqual([missing.ended, missing.answer.findings?.[0].code], [1, 'T0001'])
  const wrong = await typed(project, 'logs', '--trace', 'not-a-trace', '--data', data, '--json')
  assert.deepEqual([wrong.ended, wrong.answer.findings?.[0].code], [1, 'T0002'])

  // The slowest traces of a time, the slowest first, the run's among them.
  const slow = await value('logs', '--slow', '--since', '1 hour')
  assert.deepEqual(checkValue(shapes.slow, slow), [])
  const listed = Object(slow.traces) as { trace: string; ms: number }[]
  assert.ok(listed.some((one) => one.trace === trace))
  assert.deepEqual(
    listed.map((one) => one.ms),
    listed.map((one) => one.ms).toSorted((a, b) => b - a),
  )
})
