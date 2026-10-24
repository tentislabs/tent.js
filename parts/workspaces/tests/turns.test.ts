import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { guardedFetch } from '../../connect/index.ts'
import { createWorkspaces } from '../index.ts'
import { closing, nameOf, nobody } from './held.ts'
import type { Turned } from './turned.ts'
import { filesOf, notesOf, turned, turnModel } from './turned.ts'
import { toolTemplates } from './tooled.ts'

/** What stood before each turn: its files and its notes, by the number of the turn. */
interface Stood {
  files: Record<string, string>[]
  notes: unknown[]
  turns: string[]
}

/** Makes `count` turns of the builder on the workspace, each of which writes a file and adds a note, and answers what stood before each. */
async function turnsOn(at: Turned, count: number): Promise<Stood> {
  const project = join(at.made.folder, 'project')
  const stood: Stood = { files: [], notes: [], turns: [] }
  for (let n = 1; n <= count; n++) {
    stood.files[n] = filesOf(project)
    stood.notes[n] = await notesOf(at)
    const turn = await at.workspaces.turn(at.made.id, 'builder', `turn ${n}`, { caller: at.caller, thread: at.thread })
    assert.equal(turn.state, 'done', `turn ${n}: ${JSON.stringify(turn)}`)
    stood.turns[n] = turn.id
  }
  return stood
}

test('[40-12] with turnsKept 50, after 50 turns that change files and test rows, an undo to turns 25, 10 and 1 in that order puts back files and rows byte for byte each time', async (t) => {
  const at = await turned(t, { turnsKept: 50 })
  at.app.standIn('writer', turnModel().provider)
  const stood = await turnsOn(at, 50)
  const project = join(at.made.folder, 'project')
  assert.notDeepEqual(filesOf(project), stood.files[1])
  for (const n of [25, 10, 1]) {
    const undone = await at.workspaces.undo(at.made.id, stood.turns[n], { caller: at.caller })
    assert.equal(undone.data, 'back', `undo to turn ${n}`)
    assert.deepEqual(filesOf(project), stood.files[n], `the files of turn ${n}`)
    assert.deepEqual(await notesOf(at), stood.notes[n], `the notes of turn ${n}`)
    assert.ok(undone.changes.length > 0, `the undo to turn ${n} says what it changed`)
    const turns = at.workspaces.turns(at.made.id)
    const states = new Map(turns.map((one) => [one.id, one.state]))
    for (let later = n; later <= 50; later++) assert.equal(states.get(stood.turns[later]), 'undone', `turn ${later}`)
    for (let earlier = 1; earlier < n; earlier++)
      assert.equal(states.get(stood.turns[earlier]), 'done', `turn ${earlier}`)
  }
})

test('[40-12] with turnsKept 20, an undo to turn 10 of 30 puts back the files and answers data kept, and the rows stay', async (t) => {
  const at = await turned(t, { turnsKept: 20 })
  at.app.standIn('writer', turnModel().provider)
  const stood = await turnsOn(at, 30)
  const project = join(at.made.folder, 'project')
  const notes = await notesOf(at)
  const undone = await at.workspaces.undo(at.made.id, stood.turns[10], { caller: at.caller })
  assert.equal(undone.data, 'kept')
  assert.deepEqual(filesOf(project), stood.files[10])
  assert.deepEqual(await notesOf(at), notes, 'the rows are as they were')
})

test('[40-12] after a row was changed by hand an undo puts back the files and answers data kept, also when the workspace was closed in between, and with data back it puts the rows back', async (t) => {
  const at = await turned(t)
  at.app.standIn('writer', turnModel().provider)
  const stood = await turnsOn(at, 3)
  const project = join(at.made.folder, 'project')
  // A hand adds a note outside any turn.
  const app = await at.workspaces.run(at.made.id)
  await app.call('addNote', { body: 'by hand' }, { as: nobody })
  const notes = await notesOf(at)
  // The workspaces are closed and made again over the same folder, as when the program starts again.
  await at.workspaces.close()
  const again = createWorkspaces({
    engine: at.engine,
    app: at.app,
    folder: at.root,
    address: (id) => `http://${nameOf(id)}:${at.port}`,
    fetch: guardedFetch({ mode: 'development' }),
    templates: toolTemplates,
    trusted: ['builder'],
  })
  closing(t, () => again.close())
  const kept = await again.undo(at.made.id, stood.turns[3], { caller: at.caller })
  assert.equal(kept.data, 'kept')
  assert.deepEqual(filesOf(project), stood.files[3])
  const reopened = await again.run(at.made.id)
  assert.deepEqual(await reopened.call('allNotes', {}, { as: nobody }), notes, 'the note by hand stays')
  const back = await again.undo(at.made.id, stood.turns[2], { caller: at.caller, data: 'back' })
  assert.equal(back.data, 'back')
  assert.deepEqual(filesOf(project), stood.files[2])
  assert.deepEqual(await (await again.run(at.made.id)).call('allNotes', {}, { as: nobody }), stood.notes[2])
})
