import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Tooled } from './tooled.ts'
import { scripted } from './tooled.ts'
import { attacked } from './attacked.ts'
import { folderOf, product } from './held.ts'
import { turned, turnModel } from './turned.ts'
import { notDropped } from './started.ts'

// A table that nothing else names.
const tags = [
  "import { anyone, table, text } from 'tentjs'",
  '',
  "export const tags = table('tags', {",
  '  columns: { label: text() },',
  "  access: { read: anyone('the tags of a test app') },",
  '})',
  '',
].join('\n')

// A flow whose one step works for a minute: while it works, its run is running.
const slow = [
  "import { flow } from 'tentjs'",
  '',
  "export const slow = flow('slow', {",
  '  run: async ({ step }) => {',
  "    await step('long', () => new Promise((done) => setTimeout(done, 60_000)))",
  '  },',
  '})',
  '',
].join('\n')

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
async function stillAt(at: Tooled, run: string): Promise<{ name: string } | undefined> {
  for (let tried = 0; tried < 600; tried++) {
    const read = at.app.runs.read(run)
    if (read && ['done', 'failed', 'stopped'].includes(read.state)) return undefined
    const waiting = read?.steps.find((one) => one.state === 'waiting')
    if (read?.state === 'waiting' && waiting) return { name: waiting.name }
    await new Promise((done) => setTimeout(done, 50))
  }
  assert.fail(`the run ${run} never stood still`)
}

test('[40-17] ask that names a tool that writes no file holds it: under ask run a run of a function that sends nothing waits for the person, and is made after the yes', async (t) => {
  const at = await attacked(t)
  await at.workspaces.run(at.made.id)
  const model = scripted([
    { calls: [{ tool: 'run', with: { name: 'addNote', input: { body: 'asked' } } }] },
    { text: 'Added.' },
  ])
  at.app.standIn('writer', model.provider)
  const run = await started(at, 'runAsker', 'Add a note')
  const waiting = await stillAt(at, run)
  assert.ok(waiting, 'the run waits for the person')
  const app = await at.workspaces.run(at.made.id)
  assert.deepEqual(await app.call('allNotes', {}, { as: { kind: 'nobody' } }), [], 'nothing was made before the yes')
  at.app.runs.approve(run, waiting.name)
  assert.equal(await stillAt(at, run), undefined)
  const notes = Object(await app.call('allNotes', {}, { as: { kind: 'nobody' } }))
  assert.deepEqual(
    notes.map((one: { body: string }) => one.body),
    ['asked'],
  )
})

test('[40-17] under ask rename a rename of a column waits for the person, with the file as it was, and is made after the yes', async (t) => {
  const at = await attacked(t)
  // A table that no other definition names, so the rename changes it alone, which `narrow` may edit.
  await at.tool('write', { path: 'tables/tags.ts', text: tags })
  const path = join(at.made.folder, 'project', 'tables', 'tags.ts')
  const before = readFileSync(path, 'utf8')
  const model = scripted([
    { calls: [{ tool: 'rename', with: { name: 'tags.label', to: 'words' } }] },
    { text: 'Done.' },
  ])
  at.app.standIn('writer', model.provider)
  const run = await started(at, 'narrow', 'Call the label of a tag its words')
  const waiting = await stillAt(at, run)
  assert.ok(waiting, 'the run waits for the person')
  assert.equal(readFileSync(path, 'utf8'), before)
  at.app.runs.approve(run, waiting.name)
  assert.equal(await stillAt(at, run), undefined)
  assert.match(readFileSync(path, 'utf8'), /words: text\(\{[^}]*was: 'label'/)
})

test('[40-17] after a shot the next request to the model holds the picture as an image, and no path of the disk of the product', async (t) => {
  const at = await attacked(t)
  await at.workspaces.run(at.made.id)
  const model = scripted([{ calls: [{ tool: 'shot', with: { path: '/' } }] }, { text: 'I see it.' }])
  at.app.standIn('writer', model.provider)
  const run = await started(at, 'builder', 'Look at the home screen')
  // A picture takes a browser some time: the run is waited for to its end.
  await at.app.runs.wait(run)
  const next = model.sent[1]
  assert.ok(next, 'the model was asked again after the shot')
  const images = next.messages.flatMap((one) => one.images ?? [])
  assert.equal(images.length, 1, 'the picture reaches the model as an image')
  assert.equal(images[0]?.kind, 'image/png')
  assert.ok((images[0]?.bytes.length ?? 0) > 100)
  const told = JSON.stringify(next.messages.map((one) => ({ text: one.text, result: one.result })))
  assert.ok(!told.includes(at.root.replaceAll('\\', '\\\\')) && !told.includes(at.root), 'no path of the product disk')
})

test('[40-12] an undo while a flow of the app runs names it in kept, by its name', async (t) => {
  // The owner is trusted, so a flow of code runs in the engine: the product's code writes it.
  const at = await turned(t, {}, await product(t, folderOf(t), 'builder'))
  await at.tool('write', { path: 'functions/waits.ts', text: slow }, 'coder')
  at.app.standIn('writer', turnModel().provider)
  const turn = await at.workspaces.turn(at.made.id, 'builder', 'turn 1', { caller: at.caller, thread: at.thread })
  assert.equal(turn.state, 'done', JSON.stringify(turn))
  const app = await at.workspaces.run(at.made.id)
  const { run } = notDropped(await app.start('slow', {}, { as: { kind: 'system' } }))
  for (let tried = 0; tried < 200 && app.runs.read(run)?.state !== 'running'; tried++)
    await new Promise((done) => setTimeout(done, 50))
  assert.equal(app.runs.read(run)?.state, 'running')
  const undone = await at.workspaces.undo(at.made.id, turn.id, { caller: at.caller })
  assert.ok(
    undone.kept.some((line) => line.includes('slow')),
    JSON.stringify(undone.kept),
  )
  app.runs.stop(run)
})
