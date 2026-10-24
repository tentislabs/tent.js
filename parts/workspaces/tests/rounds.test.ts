import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scripted } from './tooled.ts'
import { turned } from './turned.ts'

// A query that orders the notes by a column they do not have: the build of the workspace finds an error in it.
const broken = [
  "import { anyone, query } from 'tentjs'",
  "import { notes } from '../tables/users'",
  '',
  "export const broken = query('broken', {",
  "  about: 'Notes by a column that is not there',",
  "  access: anyone('the notes of a test app'),",
  "  rows: notes.newest('nothing').limit(5),",
  '})',
  '',
].join('\n')

test('[40-13] a forced fix loop stops at three rounds, with the findings that are left', async (t) => {
  const at = await turned(t)
  // The model writes the same broken file whatever the findings say, and then says it is done.
  const model = scripted((request) =>
    request.messages.at(-1)?.who === 'tool'
      ? { text: 'Done.' }
      : { calls: [{ tool: 'write', with: { path: 'functions/broken.ts', text: broken } }] },
  )
  at.app.standIn('writer', model.provider)
  const turn = await at.workspaces.turn(at.made.id, 'builder', 'Add a query of the notes', {
    caller: at.caller,
    thread: at.thread,
  })
  assert.equal(turn.state, 'stopped')
  assert.equal(turn.stopped, 'rounds')
  assert.equal(turn.rounds, 3)
  assert.ok(
    turn.findings.some((one) => one.level === 'error'),
    JSON.stringify(turn.findings),
  )
  assert.equal(model.sent.length, 6, 'each round asked the model twice')
  // The second and the third round are handed the findings as their message.
  const told = model.sent.filter((one) => one.messages.at(-1)?.who === 'user').map((one) => one.messages.at(-1)?.text)
  assert.equal(told.length, 3)
  assert.match(String(told[1]), /nothing/)
  const [row] = at.workspaces.turns(at.made.id)
  assert.equal(row.id, turn.id)
  assert.equal(row.state, 'stopped')
  // The two points of the turn stand in the history.
  const points = at.workspaces.history(at.made.id).list({ kinds: ['turn'] })
  assert.equal(points.length, 2)
})

test('[40-13] a turn stops at the first call of the model after its budget was passed, as stopped budget', async (t) => {
  const at = await turned(t)
  // The model reads a file again and again, and each answer reports 10 tokens out.
  const model = scripted(() => ({ calls: [{ tool: 'read', with: { path: 'tent.ts' } }], tokensOut: 10 }))
  at.app.standIn('writer', model.provider)
  const turn = await at.workspaces.turn(at.made.id, 'builder', 'Read the project', {
    caller: at.caller,
    thread: at.thread,
    budget: { tokensOut: 25 },
  })
  assert.equal(turn.state, 'stopped')
  assert.equal(turn.stopped, 'budget')
  assert.equal(model.sent.length, 3, 'the call after the budget was passed was not made')
  assert.equal(turn.used.tokensOut, 30)
  assert.equal(turn.rounds, 1)
})
