import assert from 'node:assert/strict'
import { test } from 'node:test'
import { impactOf } from '../../publish/index.ts'
import { describeProject } from '../../build/index.ts'
import { join } from 'node:path'
import { tooled } from './tooled.ts'

test('[44-2] the project tool impact answers what tent impact prints: the project as it stands against the version that runs, in the form of the impact as JSON', async (t) => {
  const { tool, made, workspaces } = await tooled(t)
  // The version that runs, as the tool holds the change against it: taken before the change, so nothing of it is built.
  const app = await workspaces.run(made.id)
  // A rule that is widened: anyone may now read who a caller is, and nothing else changes.
  await tool('edit', {
    path: 'functions/users.ts',
    find: "about: 'The row of the caller',\n  access: 'signedIn',",
    with: "about: 'The row of the caller',\n  access: anyone('a test widens it'),",
  })
  const answered = Object(await tool('impact', {}))
  assert.equal(answered.against, 'running')
  assert.deepEqual(
    answered.rights.map((one: { name: string; change: string }) => [one.name, one.change]),
    [['whoAmI', 'now callable by anyone']],
  )
  // The same as the impact of the project as it stands against the description of the running version.
  const { description } = await describeProject(join(made.folder, 'project'))
  const expected = impactOf({ against: 'running', live: app.description, next: description })
  assert.deepEqual(answered.rights, expected.rights)
  assert.deepEqual(answered.breaks, expected.breaks)
  assert.deepEqual(answered.out, expected.out)
  // A point names what it stands against.
  assert.equal(Object(await tool('impact', { against: 'now' })).against, 'now')
})
