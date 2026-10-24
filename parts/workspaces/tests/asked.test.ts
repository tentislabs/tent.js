import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Tooled } from './tooled.ts'
import { scripted, tooled } from './tooled.ts'
import { notDropped } from './started.ts'

/** Starts a run of an agent of the product on the workspace of the test, with the project tools as its source. */
async function started(at: Tooled, agent: string, message: string): Promise<string> {
  const [row] = Object(
    await at.app.write([{ add: 'projects', values: { owner: at.owner, workspace: at.made.id } }], { as: 'system' }),
  )
  const { run } = notDropped(
    await at.app.start(
      agent,
      { message, thread: String(Object(row).id) },
      { as: at.caller, sources: [{ name: 'project', context: { workspace: at.made.id } }] },
    ),
  )
  return run
}

/** Waits for a run to stand still: ended, or waiting at a step. Answers the step that waits, or nothing where it ended. */
async function stillAt(at: Tooled, run: string): Promise<{ name: string; repeat: number } | undefined> {
  for (let tried = 0; tried < 600; tried++) {
    const read = at.app.runs.read(run)
    if (read && ['done', 'failed', 'stopped'].includes(read.state)) return undefined
    const waiting = read?.steps.find((one) => one.state === 'waiting')
    if (read?.state === 'waiting' && waiting) return { name: waiting.name, repeat: waiting.repeat }
    await new Promise((done) => setTimeout(done, 50))
  }
  assert.fail(`the run ${run} never stood still`)
}

test('[40-17] under ask remove, an edit that takes a whole definition away waits for the person, and is made once after the yes', async (t) => {
  const at = await tooled(t)
  const path = join(at.made.folder, 'project', 'functions', 'users.ts')
  const before = readFileSync(path, 'utf8')
  const start = before.indexOf('export const whoAmI')
  const find = before.slice(start, before.indexOf('})\n', start) + 3)
  const model = scripted([
    { calls: [{ tool: 'edit', with: { path: 'functions/users.ts', find, with: '' } }] },
    { text: 'Removed.' },
  ])
  at.app.standIn('writer', model.provider)
  const run = await started(at, 'asker', 'Take whoAmI away')
  const waiting = await stillAt(at, run)
  assert.ok(waiting, 'the run waits for the person')
  // Nothing was written before the yes.
  assert.equal(readFileSync(path, 'utf8'), before)
  at.app.runs.approve(run, waiting.name)
  assert.equal(await stillAt(at, run), undefined)
  assert.equal(at.app.runs.read(run)?.state, 'done')
  assert.doesNotMatch(readFileSync(path, 'utf8'), /whoAmI/)
})

test('[40-17] run of a function that sends asks the person, and a no tells the model so and sends nothing', async (t) => {
  const at = await tooled(t)
  const model = scripted([
    { calls: [{ tool: 'run', with: { name: 'mailNote', input: { to: 'x@example.com', body: 'hi' } } }] },
    { text: 'Not sent.' },
  ])
  at.app.standIn('writer', model.provider)
  const run = await started(at, 'builder', 'Mail a note')
  const waiting = await stillAt(at, run)
  assert.ok(waiting, 'the run waits for the person')
  at.app.runs.refuse(run, waiting.name)
  assert.equal(await stillAt(at, run), undefined)
  const told = JSON.stringify(model.sent.at(-1)?.messages)
  assert.match(told, /The person refused this/)
  assert.deepEqual(await at.workspaces.mail(at.made.id), [])
})

test('[40-17] shot is a picture of a screen of the workspace by a path of it, and a full address is T0002', async (t) => {
  const at = await tooled(t)
  const picture = Object(await at.tool('shot', { path: '/' }))
  assert.ok(picture.width > 0 && picture.height > 0)
  assert.equal(picture.status, 200)
  for (const path of ['http://example.com/', '//example.com/x', 'file:///etc/passwd'])
    await assert.rejects(at.tool('shot', { path }), { code: 'T0002' }, path)
})
