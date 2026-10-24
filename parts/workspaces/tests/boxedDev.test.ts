import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { apartRoom } from '../../engine/index.ts'
import { asked, folderOf, held, product } from './held.ts'
import { testSandbox } from './sandbox.ts'

test('[52-10] [40-20] the test side of a workspace of anyone else is a development build in its box, which the inspect mode reads its places from, and what it makes live is a release', async (t) => {
  const sandbox = testSandbox(t)
  const at = await product(t, folderOf(t))
  const live = (id: string) => ({
    dataFolder: join(at.folder, 'live', id),
    address: `http://${id}.live.test:${at.port}`,
  })
  const made = await held(t, { sandbox, room: apartRoom, live, trusted: [] }, at)
  const [row] = Object(
    await made.app.write([{ add: 'users', values: { email: 'ada@example.com', roles: [] } }], { as: 'system' }),
  )
  const workspace = await made.workspaces.create({ owner: String(Object(row).id), from: 'coded' })
  const app = await made.workspaces.run(workspace.id)
  assert.match(sandbox.commands[0] ?? '', /^tent build --dev --out "[^"]+" --json$/)
  assert.equal(app.description.app.dev, true, 'the test side is a development build')
  const before = sandbox.commands.length
  await made.workspaces.publish(workspace.id)
  const releases = sandbox.commands.slice(before).filter((one) => one.startsWith('tent build'))
  assert.equal(releases.length, 1, JSON.stringify(sandbox.commands))
  assert.match(releases[0] ?? '', /^tent build --out "[^"]+" --json$/)
  const page = await asked(at.port, `${workspace.id}.live.test`, '/')
  assert.equal(page.status, 200)
})
