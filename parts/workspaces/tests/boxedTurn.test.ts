import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { folderOf, identify, nobody, product } from './held.ts'
import { apartRoom } from '../../engine/index.ts'
import { testSandbox } from './sandbox.ts'
import { filesOf, notesOf, turned, turnModel } from './turned.ts'

test('[52-10] [40-20] the turn, its undo and the tool rows work on the app of a workspace of anyone else, in the room of the workspaces', async (t) => {
  const sandbox = testSandbox(t)
  const at = await turned(
    t,
    { sandbox, room: apartRoom, identify, trusted: [] },
    await product(t, folderOf(t), 'builder'),
    'coded',
  )
  assert.ok(sandbox.started.length > 0, 'the workspace of code is built in its box')
  at.app.standIn('writer', turnModel().provider)
  const project = join(at.made.folder, 'project')
  const files = filesOf(project)
  assert.deepEqual(await notesOf(at), [])
  const turn = await at.workspaces.turn(at.made.id, 'coder', 'turn 1', { caller: at.caller, thread: at.thread })
  assert.equal(turn.state, 'done', JSON.stringify(turn))
  // The note that the turn added through the tool run lies in the data of the workspace, and the tool rows reads it.
  const rows = Object(await at.tool('rows', { table: 'notes' }, 'coder')).rows
  assert.deepEqual(
    rows.map((one: { body: string }) => one.body),
    ['note of turn 1'],
  )
  const undone = await at.workspaces.undo(at.made.id, turn.id, { caller: at.caller })
  assert.equal(undone.data, 'back')
  assert.deepEqual(filesOf(project), files)
  assert.deepEqual(await notesOf(at), [])
})

// A plain action that sends a mail, which the test side of a workspace writes down in place of sending it.
const mailing = [
  "import { action, anyone, mail, text } from 'tentjs'",
  '',
  "export const mailNote = action('mailNote', {",
  "  about: 'Mails a note to an address',",
  '  input: { to: text(), body: text() },',
  "  access: anyone('the letters of a test app'),",
  '  run: async ({ input }) => {',
  "    await mail.send({ to: input.to, from: 'app@example.com', subject: 'A note', text: input.body })",
  '  },',
  '})',
  '',
].join('\n')

test('[52-10] [40-20] mail of a workspace of anyone else reads the mail that its app wrote down', async (t) => {
  const sandbox = testSandbox(t)
  const at = await turned(
    t,
    { sandbox, room: apartRoom, identify, trusted: [] },
    await product(t, folderOf(t), 'builder'),
    'coded',
  )
  await at.tool('write', { path: 'functions/mailing.ts', text: mailing }, 'coder')
  const app = await at.workspaces.run(at.made.id)
  await app.call('mailNote', { to: 'ada@example.com', body: 'hello' }, { as: nobody })
  const mails = await at.workspaces.mail(at.made.id)
  assert.equal(mails.length, 1, JSON.stringify(mails))
  assert.equal(Reflect.get(Object(mails[0]), 'subject'), 'A note')
  assert.equal(Reflect.get(Object(mails[0]), 'text'), 'hello')
})
