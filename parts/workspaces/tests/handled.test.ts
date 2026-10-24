import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { guardedFetch } from '../../connect/index.ts'
import type { Caller } from '../../core/index.ts'
import type { App } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { createWorkspaces } from '../index.ts'
import { asked, closing, folderOf, nameOf, product, trusted } from './held.ts'
import { refusal, toolTemplates } from './tooled.ts'
import { turned, turnModel } from './turned.ts'

/** Adds a user of the product, and answers them as a caller. */
async function userOf(app: App, email: string): Promise<Caller> {
  const [row] = Object(await app.write([{ add: 'users', values: { email, roles: ['builder'] } }], { as: 'system' }))
  return { kind: 'user', user: { id: String(Object(row).id), roles: [] } }
}

/** Waits for the turns of a workspace to stand still, through the handle, and answers the newest. */
async function settled(app: App, as: Caller, workspace: string): Promise<{ id: string; state: string }> {
  for (let tried = 0; tried < 1200; tried++) {
    const [newest] = Object(await app.call('listTurns', { workspace }, { as }))
    if (newest && newest.state !== 'working') return newest
    await new Promise((done) => setTimeout(done, 50))
  }
  assert.fail('the turn never ended')
}

test('[40-19] the handle workspaces from an action of the product: create, turn with wait false, turns, undo, values, mail and publish work for the owner, and each is T3101 for another user', async (t) => {
  const at = await product(t, folderOf(t), 'builder')
  const live = (id: string) => ({
    dataFolder: join(at.folder, 'live', id),
    address: `http://${id}.live.test:${at.port}`,
  })
  const made = await turned(t, { live }, at)
  made.app.standIn('writer', turnModel().provider)
  const ada = made.caller
  const bob = await userOf(made.app, 'bob@example.com')
  const project = Object(await made.app.call('newProject', { from: 'notes' }, { as: ada }))
  assert.ok(made.workspaces.get(project.workspace), 'the workspace is made')
  assert.equal(made.workspaces.get(project.workspace)?.owner, ada.user?.id)
  const started = Object(
    await made.app.call(
      'askTurn',
      { workspace: project.workspace, project: project.project, message: 'turn 1' },
      { as: ada },
    ),
  )
  assert.equal(started.state, 'working', 'with wait false the turn answers once its run started')
  assert.ok(started.run)
  const done = await settled(made.app, ada, project.workspace)
  assert.equal(done.id, started.id)
  assert.equal(done.state, 'done')
  const undone = Object(await made.app.call('undoTurn', { workspace: project.workspace, turn: done.id }, { as: ada }))
  assert.equal(undone.data, 'back')
  assert.deepEqual(
    await made.app.call('setValue', { workspace: project.workspace, name: 'STRIPE_KEY', value: 'sk_a' }, { as: ada }),
    ['STRIPE_KEY'],
  )
  assert.deepEqual(await made.app.call('mailOf', { workspace: project.workspace }, { as: ada }), [])
  await made.app.call('publishIt', { workspace: project.workspace }, { as: ada })
  const answered = await asked(made.port, `${project.workspace}.live.test`, '/')
  assert.equal(answered.status, 200, answered.body)
  // Another user is refused each member on the workspace of the owner.
  for (const [name, input] of [
    ['askTurn', { workspace: project.workspace, project: project.project, message: 'turn 2' }],
    ['listTurns', { workspace: project.workspace }],
    ['undoTurn', { workspace: project.workspace, turn: done.id }],
    ['setValue', { workspace: project.workspace, name: 'STRIPE_KEY', value: 'sk_b' }],
    ['mailOf', { workspace: project.workspace }],
    ['publishIt', { workspace: project.workspace }],
  ] as const)
    assert.equal((await refusal(made.app.call(name, input, { as: bob })))?.code, 'T3101', name)
})

test('[40-19] may lets another user in, and in an app that no program gave workspaces the handle is T0013', async (t) => {
  const at = await product(t, folderOf(t), 'builder')
  const holder = await userOf(at.app, 'ada@example.com')
  const helper = await userOf(at.app, 'bob@example.com')
  const workspaces = createWorkspaces({
    engine: at.engine,
    app: at.app,
    folder: join(at.folder, 'workspaces'),
    address: (id) => `http://${nameOf(id)}:${at.port}`,
    fetch: guardedFetch({ mode: 'development' }),
    templates: toolTemplates,
    trusted,
    may: (caller) => caller.kind === 'user' && caller.user?.id === helper.user?.id,
  })
  closing(t, () => workspaces.close())
  const project = Object(await at.app.call('newProject', { from: 'notes' }, { as: holder }))
  assert.deepEqual(await at.app.call('listTurns', { workspace: project.workspace }, { as: helper }), [])
  // The same product, opened in an engine that no program gave workspaces.
  const bare = await product(t, folderOf(t), 'builder')
  const somebody = await userOf(bare.app, 'cy@example.com')
  assert.equal((await refusal(bare.app.call('newProject', { from: 'notes' }, { as: somebody })))?.code, 'T0013')
})

test('[40-19] a workspace published into the product own engine answers at its address, also after the program was started again', async (t) => {
  const at = await product(t, folderOf(t), 'builder')
  const live = (id: string) => ({
    dataFolder: join(at.folder, 'live', id),
    address: `http://${id}.live.test:${at.port}`,
  })
  const made = await turned(t, { live }, at)
  await made.workspaces.publish(made.made.id)
  assert.equal((await asked(at.port, `${made.made.id}.live.test`, '/')).status, 200)
  // The program ends, and starts again on the same port, the same product data and the same folder.
  await made.workspaces.close()
  await at.engine.close()
  const engine = createEngine({ port: at.port })
  closing(t, () => engine.close())
  const app = await engine.open(String(at.bundle), { dataFolder: join(at.folder, 'builder-data'), mode: 'test' })
  const again = createWorkspaces({
    engine,
    app,
    folder: made.root,
    address: (id) => `http://${nameOf(id)}:${at.port}`,
    fetch: guardedFetch({ mode: 'development' }),
    templates: toolTemplates,
    trusted,
    live,
  })
  closing(t, () => again.close())
  let status = 0
  for (let tried = 0; tried < 200 && status !== 200; tried++) {
    status = (await asked(at.port, `${made.made.id}.live.test`, '/')).status
    if (status !== 200) await new Promise((done) => setTimeout(done, 50))
  }
  assert.equal(status, 200)
})
