import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { attacked, projectFiles } from './attacked.ts'
import { asked, identify, nameOf } from './held.ts'
import { apartRoom } from '../../engine/index.ts'
import { testSandbox } from './sandbox.ts'

/** Workspaces with code of an owner who is not trusted, built in a test box and run in the room of the workspaces. */
async function boxedEcho(t: TestContext) {
  const sandbox = testSandbox(t)
  const at = await attacked(t, { sandbox, room: apartRoom, identify, trusted: [] }, 'echoed')
  await at.workspaces.run(at.made.id)
  return { ...at, sandbox }
}

/** What the route of the workspace was handed, for a request at the name of the workspace. */
async function echoed(port: number, id: string, headers: Record<string, string>) {
  const answer = await asked(port, nameOf(id), '/echo', { headers })
  assert.equal(answer.status, 200, answer.body)
  return JSON.parse(answer.body) as { cookie: string; caller: string; user: string }
}

test('[05-16.24] a route of code of anyone else that reads the Cookie line of a request of a signed-in visitor of the product holds no cookie of the product own names', async (t) => {
  const at = await boxedEcho(t)
  const app = at.app.description.app.name
  const cookie = [
    `tent_session.${app}=s1`,
    `__Host-tent_session.${app}=s2`,
    `__Secure-tent_visitor.${app}=v1`,
    `tent_state.${app}=x`,
    'theirs=kept',
  ].join('; ')
  const seen = await echoed(at.port, at.made.id, { cookie, 'x-test-user': 'ada@example.com' })
  for (const name of ['s1', 's2', 'v1', `tent_state.${app}`])
    assert.ok(!seen.cookie.includes(name), `${name} reached the code: ${seen.cookie}`)
  assert.match(seen.cookie, /theirs=kept/)
})

test('[05-16.25] a visitor of an app of anyone else who sends Tent-Caller and an Authorization of their own making is nobody there', async (t) => {
  const at = await boxedEcho(t)
  const sent: Record<string, string>[] = [
    { 'tent-caller': 'system', authorization: 'Bearer made-up' },
    { 'tent-caller': 'system', authorization: `Bearer ${'0'.repeat(43)}` },
    { 'Tent-Caller': 'system' },
  ]
  for (const headers of sent) {
    const seen = await echoed(at.port, at.made.id, headers)
    assert.equal(seen.caller, '', JSON.stringify(headers))
    assert.equal(seen.user, '', JSON.stringify(headers))
  }
})

test('[05-16.26] the admin channel of the product engine is not reached through the name of a workspace of anyone else', async (t) => {
  const at = await boxedEcho(t)
  for (const name of ['asleep', 'logs', 'values', 'run']) {
    const answer = await asked(at.port, nameOf(at.made.id), `/_t/admin/${name}`, {
      method: 'POST',
      body: '{"args":{}}',
      headers: { 'tent-caller': 'system' },
    })
    assert.notEqual(Object(JSON.parse(answer.body || '{}')).ok, true, `${name} answered at the name of the workspace`)
  }
})

test('[05-16.27] code of anyone else runs in the room of the workspaces, never in the program of the product engine', async (t) => {
  const sandbox = testSandbox(t)
  const made: string[] = []
  const at = await attacked(
    t,
    {
      sandbox,
      room: (o) => {
        made.push(o.where)
        return apartRoom(o)
      },
      identify,
      trusted: [],
    },
    'echoed',
  )
  await at.workspaces.run(at.made.id)
  await echoed(at.port, at.made.id, {})
  assert.ok(made.includes('main'), 'the app of the workspace was given the room of the workspaces')
})

test('[05-16.28] a build in a box writes into its work alone, and nothing of the project folder changes with a build', async (t) => {
  const at = await boxedEcho(t)
  const before = projectFiles(at.made.folder)
  await at.workspaces.rebuild(at.made.id, { kind: 'person' })
  const builds = at.sandbox.commands.filter((one) => one.startsWith('tent build'))
  assert.ok(builds.length >= 2)
  for (const one of builds) assert.ok(one.includes(at.sandbox.started[0]?.work ?? '?'), one)
  assert.deepEqual(projectFiles(at.made.folder), before)
})
