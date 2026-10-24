import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { apartRoom } from '../../engine/index.ts'
import { attacked } from './attacked.ts'
import { asked, identify, nameOf } from './held.ts'
import { testSandbox } from './sandbox.ts'

// A workspace of code of an owner who is not trusted, built in a test box and run in the room of the workspaces.
async function boxedEcho(t: TestContext) {
  const sandbox = testSandbox(t)
  const at = await attacked(t, { sandbox, room: apartRoom, identify, trusted: [] }, 'echoed')
  await at.workspaces.run(at.made.id)
  return at
}

/** What the route of the workspace was handed, for a request at the name of the workspace. */
async function echoed(port: number, id: string, headers: Record<string, string>) {
  const answer = await asked(port, nameOf(id), '/echo', { headers })
  assert.equal(answer.status, 200, answer.body)
  return JSON.parse(answer.body) as { cookie: string; caller: string; user: string }
}

// [05-19.10] A stranger's workspace tries the paths of the old box - Tent-Caller, the admin channel, the token of a
// box - and none exists: the app is a caller of nobody but by the door, and the old box is gone.
test('[05-19.10] a workspace of anyone else that tries the paths of the old box reaches none: Tent-Caller is nobody there, and the admin channel is not reached at the name of the workspace', async (t) => {
  const at = await boxedEcho(t)
  // Tent-Caller and an Authorization of the visitor's own making name nobody inside the workspace.
  const sent: Record<string, string>[] = [
    { 'tent-caller': 'system', authorization: 'Bearer made-up' },
    { 'Tent-Caller': 'system', authorization: `Bearer ${'0'.repeat(43)}` },
  ]
  for (const headers of sent) {
    const seen = await echoed(at.port, at.made.id, headers)
    assert.equal(seen.caller, '', JSON.stringify(headers))
    assert.equal(seen.user, '', JSON.stringify(headers))
  }
  // The admin channel of the product's engine - the one the old box was reached over - answers nothing at the name
  // of a workspace: there is no box, and no token of one.
  for (const name of ['asleep', 'logs', 'values', 'run']) {
    const answer = await asked(at.port, nameOf(at.made.id), `/_t/admin/${name}`, {
      method: 'POST',
      body: '{"args":{}}',
      headers: { 'tent-caller': 'system' },
    })
    assert.notEqual(Object(JSON.parse(answer.body || '{}')).ok, true, `${name} answered at the name of the workspace`)
  }
})
