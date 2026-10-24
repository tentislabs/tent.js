import assert from 'node:assert/strict'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

// A run that writes a team's file, and an undo of it.
const more = `
export const teamWork = flow('teamWork', {
  input: { team: text() },
  run: async ({ input: given, step }) => step('task', () => writeTask({ team: given.team, title: 'second' })),
})

export const undoRun = action('undoRun', {
  access: 'nobody',
  system: 'undo writes what the run wrote',
  input: { run: text() },
  output: json(),
  run: async ({ input: given }) => undo.run(given.run),
})
`

test('[45-17] [45-19.14] the changes of a file of a tenant say who made them, and an undo takes back what a run wrote there', async (t) => {
  const folder = copyOf(t, 'archived')
  const file = join(folder, 'functions', 'functions.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      "import { anyone, change, number, query, text } from 'tentjs'",
      "import { action, anyone, change, flow, json, number, query, text, undo } from 'tentjs'",
    ),
  )
  appendFileSync(file, more)
  const app = await testApp({ folder })
  closing(t, () => app.close())
  const team = String(await app.call('addTeam', { name: 'one' }, system))
  const first = String(await app.call('writeTask', { team, title: 'first' }, system))
  const started = await app.start('teamWork', { team }, system)
  assert.ok('run' in started, 'the start was not dropped')
  const { run } = started
  await app.runs.wait(run)
  const tasksOf = async () => {
    const rows: unknown = await app.read({ from: 'tasks', of: team, sort: [{ by: 'title' }] }, system)
    return (Array.isArray(rows) ? rows : []).map((one) => [
      Reflect.get(Object(one), 'title'),
      Reflect.get(Object(one), 'done'),
    ])
  }
  assert.deepEqual(await tasksOf(), [
    ['first', true],
    ['second', false],
  ])
  const answer: Record<string, unknown> = Object(await app.call('undoRun', { run }, system))
  assert.equal(answer.undone, 2, 'the task the run added, and the one it marked done')
  assert.deepEqual(answer.clashes, [])
  assert.deepEqual(await tasksOf(), [['first', false]])
  assert.equal(typeof first, 'string')
})
