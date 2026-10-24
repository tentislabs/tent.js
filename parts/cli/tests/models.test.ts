import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boolean, list, number, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import { copied, typed } from './typed.ts'

/** The stored shape of a model as `tent models` prints it with `--json`. */
const listed = object({
  name: text(),
  provider: text(),
  model: text(),
  abilities: list(text()),
  takes: number({ optional: true }),
  voices: list(text(), { optional: true }),
  function: boolean(),
  limits: object({ perDay: object({ calls: number() }) }, { optional: true }),
  fallback: list(text()),
})

/** The stored shape of what `tent models test` prints of one model with `--json`. */
const tried = object({
  name: text(),
  calls: object({
    reply: object({ ok: boolean(), code: text({ optional: true }), message: text({ optional: true }) }),
    fill: object(
      { ok: boolean(), code: text({ optional: true }), message: text({ optional: true }) },
      { optional: true },
    ),
  }),
  reasoning: boolean({ optional: true }),
})

test('[15-6@9a] tent models lists every model of the project with what it can do, and tent models test tries each fixed call of a model against its server, each with its stored shape', async (t) => {
  const project = copied(t, 'models-listed', 'modeled')
  const all = await typed(project, 'models', '--json')
  assert.equal(all.ended, 0, all.printed)
  const models: Record<string, unknown>[] = Object(all.answer.value)
  for (const one of models) assert.deepEqual(checkValue(listed, one), [], JSON.stringify(one))
  const byName = Object.fromEntries(models.map((one) => [one.name, one]))
  // What the list of a shipped provider knows of a model, and what a definition states.
  assert.deepEqual(byName.writer.abilities, ['reply', 'tools', 'typedAnswers', 'images', 'reasoning'])
  assert.equal(byName.writer.takes, 200_000)
  assert.deepEqual([byName.local.abilities, byName.local.takes], [['reply', 'typedAnswers', 'reasoning'], 8000])
  assert.deepEqual([byName.painter.function, byName.local.function], [true, false])
  const local = await typed(project, 'models', 'test', 'local', '--json')
  assert.equal(local.ended, 0, local.printed)
  const [one] = Object(local.answer.value)
  assert.deepEqual(checkValue(tried, one), [], JSON.stringify(one))
  assert.deepEqual(one, { name: 'local', calls: { reply: { ok: true }, fill: { ok: true } }, reasoning: true })
  const broken = await typed(project, 'models', 'test', 'broken', '--json')
  const [down] = Object(broken.answer.value)
  assert.deepEqual(checkValue(tried, down), [], JSON.stringify(down))
  assert.deepEqual([down.calls.reply.ok, down.calls.reply.code], [false, 'T7104'])
})
