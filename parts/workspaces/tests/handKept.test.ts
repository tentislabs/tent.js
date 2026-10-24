import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { apartRoom } from '../../engine/index.ts'
import { calledAt, folderOf, identify, nameOf, product } from './held.ts'
import type { TestSandbox } from './sandbox.ts'
import { testSandbox } from './sandbox.ts'
import type { Turned } from './turned.ts'
import { notesOf, turned, turnModel } from './turned.ts'

/** The words of the notes of the test data of a workspace, in order. */
const bodiesOf = (notes: unknown): string[] => (Array.isArray(notes) ? notes.map((one) => String(one.body)) : []).sort()

/** A workspace of code of anyone else, built in its box and run in the room, with the model of the turns. */
async function boxedTurns(t: TestContext): Promise<Turned & { sandbox: TestSandbox }> {
  const sandbox = testSandbox(t)
  const at = await turned(
    t,
    { sandbox, room: apartRoom, identify, trusted: [] },
    await product(t, folderOf(t), 'builder'),
    'coded',
  )
  at.app.standIn('writer', turnModel().provider)
  return { ...at, sandbox }
}

/** Adds a note through the door of the app of the workspace, as a page of it does in the frame of the product. */
async function byHand(at: Turned): Promise<void> {
  const origin = `http://${nameOf(at.made.id)}:${at.port}`
  const added = await calledAt(at.port, nameOf(at.made.id), 'addNote', { body: 'by hand' }, { origin })
  assert.equal(added.ok, true, JSON.stringify(added))
}

test('[40-12] an undo after a row was added by hand through the app of the workspace, after the turn ended, puts the files back and keeps the data, the row of the hand among it', async (t) => {
  const at = await boxedTurns(t)
  const turn = await at.workspaces.turn(at.made.id, 'coder', 'turn 1', { caller: at.caller, thread: at.thread })
  assert.equal(turn.state, 'done', JSON.stringify(turn))
  await byHand(at)
  const undone = await at.workspaces.undo(at.made.id, turn.id, { caller: at.caller })
  assert.equal(undone.data, 'kept')
  assert.deepEqual(bodiesOf(await notesOf(at)), ['by hand', 'note of turn 1'])
})

test('[40-12] a row added by hand once the run of the turn ended, while the turn still builds and checks, is no change of the turn: its undo keeps the data, the row of the hand among it', async (t) => {
  const at = await boxedTurns(t)
  // The person adds the note as the box builds what the run of the turn wrote: the page shows no working run then.
  // A tool that writes reads its file in the box too, while the run still works: that build is the run's.
  let run: string | undefined
  let added = false
  const ran = at.sandbox.run
  at.sandbox.run = async (box, command, o) => {
    const state = run === undefined ? undefined : at.app.runs.read(run)?.state
    if (
      !added &&
      state !== undefined &&
      !['queued', 'running', 'waiting'].includes(state) &&
      command.startsWith('tent build')
    ) {
      added = true
      await byHand(at)
    }
    return ran(box, command, o)
  }
  const started = await at.workspaces.turn(at.made.id, 'coder', 'turn 1', {
    caller: at.caller,
    thread: at.thread,
    wait: false,
  })
  run = started.run
  let [turn] = at.workspaces.turns(at.made.id)
  for (let tries = 0; tries < 600 && turn?.state === 'working'; tries++) {
    await new Promise((done) => setTimeout(done, 100))
    ;[turn] = at.workspaces.turns(at.made.id)
  }
  assert.equal(added, true, 'the note was added while the box built')
  assert.equal(turn?.id, started.id)
  assert.equal(turn?.state, 'done', JSON.stringify(turn))
  const undone = await at.workspaces.undo(at.made.id, started.id, { caller: at.caller })
  assert.equal(undone.data, 'kept')
  assert.deepEqual(bodiesOf(await notesOf(at)), ['by hand', 'note of turn 1'])
})

test('[40-12] an undo whose data the disk does not let back fails with T0009 and leaves the app of the workspace on its data as it was, and the workspaces close', {
  timeout: 180_000,
}, async (t) => {
  const at = await turned(t, {}, await product(t, folderOf(t), 'builder'))
  at.app.standIn('writer', turnModel().provider)
  const turn = await at.workspaces.turn(at.made.id, 'builder', 'turn 1', { caller: at.caller, thread: at.thread })
  assert.equal(turn.state, 'done', JSON.stringify(turn))
  // The disk refuses the copy beside the data file, as Windows refuses a file that it still holds.
  const coming = join(at.made.folder, 'data', 'data.db.coming')
  mkdirSync(coming)
  writeFileSync(join(coming, 'held'), '')
  const refused = await at.workspaces.undo(at.made.id, turn.id, { caller: at.caller }).catch((error: unknown) => error)
  assert.equal(Reflect.get(Object(refused), 'code'), 'T0009', String(refused))
  assert.deepEqual(bodiesOf(await notesOf(at)), ['note of turn 1'])
  rmSync(coming, { recursive: true, force: true })
  const app = await at.workspaces.run(at.made.id)
  await app.call('addNote', { body: 'after' }, { as: { kind: 'nobody' } })
  assert.deepEqual(bodiesOf(await notesOf(at)), ['after', 'note of turn 1'])
  await at.workspaces.close()
})
