import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Makers } from '../../engine/index.ts'
import { apartRoom, createEngine, writeKey } from '../../engine/index.ts'
import { openHistory } from '../../history/index.ts'
import { serveSync } from '../../publish/index.ts'
import type { Held } from './held.ts'
import { asked, calledAt, closing, folderOf, held, identify, nameOf, product, templates, system } from './held.ts'
import type { TestSandbox } from './sandbox.ts'
import { testSandbox } from './sandbox.ts'

/** The id of a user of the product, with the roles it is given. */
async function userOf(at: Held, email: string, roles: string[]): Promise<string> {
  const [row] = Object(await at.app.write([{ add: 'users', values: { email, roles } }], { as: 'system' }))
  return String(Object(row).id)
}

/** The room the workspaces of these tests run code of anyone else in: the test room, which counts what it made. */
function countedRoom(): { room: NonNullable<Makers['room']>; made: string[] } {
  const made: string[] = []
  return {
    made,
    room: (o) => {
      made.push(o.app)
      return apartRoom(o)
    },
  }
}

/** Workspaces that hold code, with a test Sandbox and a room, and a workspace of code of an owner who is not trusted. */
async function boxed(t: TestContext, o: { sleepAfter?: string } = {}) {
  const sandbox: TestSandbox = testSandbox(t)
  const { room, made: rooms } = countedRoom()
  const at = await held(t, { sandbox, room, identify, ...o })
  const owner = await userOf(at, 'ada@example.com', [])
  const made = await at.workspaces.create({ owner, from: 'coded' })
  return { ...at, sandbox, rooms, owner, made }
}

test('[52-10] [40-20] [22-20] with a test Sandbox a workspace of an owner who is not trusted is built by run in its box and opened in the product engine with the room of createWorkspaces, answering on its name, its data in <id>/data/', async (t) => {
  const { workspaces, sandbox, rooms, owner, made, port } = await boxed(t)
  const app = await workspaces.run(made.id)
  // `start` was handed the id, the owner and the two folders of the host, and no limit.
  assert.deepEqual(sandbox.started[0], {
    id: made.id,
    owner,
    folder: join(made.folder, 'project'),
    work: join(made.folder, 'box'),
  })
  assert.deepEqual(Object.keys(sandbox.started[0] ?? {}).sort(), ['folder', 'id', 'owner', 'work'])
  // The box ran the build and the check alone: nothing of the box serves.
  assert.equal(sandbox.commands.length, 2)
  assert.match(sandbox.commands[0] ?? '', /^tent build --dev --out "[^"]+" --json$/)
  assert.equal(sandbox.commands[1], 'tent check --json')
  assert.ok((sandbox.commands[0] ?? '').includes(join(made.folder, 'box', 'builds')))
  // The app was opened in the product's engine, in the room of the workspaces, with its data in the workspace.
  assert.deepEqual(rooms, [app.description.app.name])
  assert.ok(existsSync(join(made.folder, 'data', 'data.db')))
  assert.ok(!existsSync(join(made.folder, 'box', 'data')))
  await app.call('addNote', { body: 'in the room' }, { as: system })
  // A request at the workspace's name is answered by its app in the product's engine.
  const at = await calledAt(port, nameOf(made.id), 'allNotes', {})
  assert.deepEqual(
    Object(at.value).map((row: { body: string }) => row.body),
    ['in the room'],
  )
  // For an id whose box stands, `start` answers that box: the app stays the one the engine holds.
  const again = await workspaces.run(made.id)
  assert.equal(again, app)
})

test('[52-10] [40-20] a request of a user whom the product identify named arrives as that user, and a Tent-Caller that a visitor sent is nobody', async (t) => {
  const { workspaces, made, port } = await boxed(t)
  const app = await workspaces.run(made.id)
  const name = nameOf(made.id)
  // The product's identify names the user, whose row it adds to the workspace's own users the first time.
  const ada = { 'x-test-user': 'ada@example.com' }
  await calledAt(port, name, 'whoAmI', {}, ada)
  const users: { id: string; email: string }[] = Object(await app.read({ from: 'users' }, { as: 'system' }))
  const adaId = users.find((one) => one.email === 'ada@example.com')?.id
  assert.ok(adaId, JSON.stringify(users))
  const me = await calledAt(port, name, 'whoAmI', {}, ada, adaId)
  assert.equal(Object(me.value).email, 'ada@example.com', JSON.stringify(me))
  // A visitor that identify does not name keeps the Authorization of their own, which the app reads.
  const [bob] = Object(
    await app.write([{ add: 'users', values: { email: 'bob@example.com', roles: [] } }], { as: 'system' }),
  )
  const key = String(Object(await app.call('makeKey', { user: Object(bob).id }, { as: system })).key)
  const asBob = await calledAt(port, name, 'whoAmI', {}, { authorization: `Bearer ${key}` }, Object(bob).id)
  assert.equal(Object(asBob.value).email, 'bob@example.com', JSON.stringify(asBob))
  // A Tent-Caller that a visitor sent is read from this computer's commands alone, and they are nobody.
  const planted = await calledAt(port, name, 'whoAmI', {}, { 'tent-caller': String(Object(bob).id) })
  assert.equal(planted.error?.code, 'T0006')
})

test('[52-10] [40-20] a file that changed is in the next build in the box, which the product engine makes the running version, and no build writes into the folder of the project', async (t) => {
  const { workspaces, made, port, sandbox } = await boxed(t)
  const app = await workspaces.run(made.id)
  const before = readdirSync(join(made.folder, 'project'), { recursive: true }).map(String).sort()
  const screen = join(made.folder, 'project', 'screens', 'home.tsx')
  writeFileSync(screen, readFileSync(screen, 'utf8').replace('        Notes\n', '        Changed notes\n'))
  const rebuilt = await workspaces.rebuild(made.id, { kind: 'person', id: made.owner })
  assert.deepEqual(
    rebuilt.findings.filter((one) => one.level === 'error'),
    [],
  )
  assert.equal(app.versions().find((one) => one.running)?.id, rebuilt.version)
  const page = await asked(port, nameOf(made.id), '/')
  assert.match(page.body, /Changed notes/)
  assert.equal(sandbox.commands.filter((one) => one.startsWith('tent build')).length, 2)
  // Nothing was written into the project's folder: the build writes into the box's work alone.
  const after = readdirSync(join(made.folder, 'project'), { recursive: true }).map(String).sort()
  assert.deepEqual(after, before)
  assert.equal(rebuilt.point.kind, 'command')
})

test('[52-10] [40-20] values of the test side work on the app of the workspace, which sleeps and wakes as any workspace', async (t) => {
  const { workspaces, made, port } = await boxed(t, { sleepAfter: '2 seconds' })
  const app = await workspaces.run(made.id)
  await workspaces.values(made.id, { side: 'test', kind: 'secret', name: 'STRIPE_KEY', value: 'sk_box' })
  assert.deepEqual(await workspaces.values(made.id, { side: 'test', kind: 'secret', list: true }), ['STRIPE_KEY'])
  // The app sleeps once nothing used it, as any workspace does.
  for (let waited = 0; !existsSync(join(made.folder, 'data', 'asleep.json')); waited++) {
    assert.ok(waited < 300, 'the app of the workspace did not fall asleep')
    await new Promise((done) => setTimeout(done, 100))
  }
  // A request wakes it, in its room.
  const at = await calledAt(port, nameOf(made.id), 'allNotes', {})
  assert.deepEqual(at.value, [])
  assert.equal(await workspaces.run(made.id), app)
})

test('[52-10] [40-20] [16-2@10a] code of an owner who is not trusted is published to a Target, and into the product engine with the same room; with no room it is T9105, and a trusted owner builds and runs it in the program', async (t) => {
  // A server that runs the app, which a publish of the workspace goes to.
  const folder = folderOf(t)
  const served = await buildProject(templates.coded, { for: 'release', out: join(folder, 'served-bundle') })
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const data = join(folder, 'served-data')
  const there = await engine.open(served.bundleFolder, { dataFolder: data, mode: 'live' })
  const history = openHistory(data)
  closing(t, () => history.close())
  serveSync(engine, there, history)
  const address = `http://127.0.0.1:${JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port}`
  const target = { address, key: writeKey(there, { name: 'deploy', rights: ['publish'] }).key }

  const sandbox = testSandbox(t)
  const { room, made: rooms } = countedRoom()
  const at = await held(t, { sandbox, room, live: () => target })
  const owner = await userOf(at, 'ada@example.com', [])
  const made = await at.workspaces.create({ owner, from: 'coded' })
  await at.workspaces.run(made.id)
  const published = await at.workspaces.publish(made.id)
  assert.equal(there.versions().find((one) => one.running)?.id, published.version)
  // The bundle that went out is the one the box built.
  assert.ok(sandbox.commands.some((one) => one.startsWith('tent build')))

  // Into the product's own engine, with the same room.
  const own = await held(t, {
    sandbox,
    room,
    live: () => ({ dataFolder: join(folder, 'own-data'), address: 'http://own.test' }),
  })
  const ownOwner = await userOf(own, 'cy@example.com', [])
  const mine = await own.workspaces.create({ owner: ownOwner, from: 'coded' })
  const before = rooms.length
  const live = await own.workspaces.publish(mine.id)
  assert.ok(live.version)
  assert.ok(rooms.length > before, 'the live app was opened in the room of the workspaces')

  // With a Sandbox and no room, code is neither built nor run.
  const roomless = await held(t, { sandbox }, await product(t, join(folder, 'roomless')))
  const fay = await userOf(roomless, 'fay@example.com', [])
  const hers0 = await roomless.workspaces.create({ owner: fay, from: 'coded' })
  const builds = sandbox.commands.length
  await assert.rejects(roomless.workspaces.run(hers0.id), { code: 'T9105' })
  assert.equal(sandbox.commands.length, builds, 'nothing was built')

  // With neither `trusted` nor a Sandbox, code is neither built nor run.
  const bare = await held(t, {}, await product(t, join(folder, 'bare')))
  const dan = await userOf(bare, 'dan@example.com', [])
  const coded = await bare.workspaces.create({ owner: dan, from: 'coded' })
  await assert.rejects(bare.workspaces.run(coded.id), { code: 'T9105' })
  // So is a workspace with no code of its own beside its screens: a screen is code.
  const plain = await bare.workspaces.create({ owner: dan, from: 'blank' })
  await assert.rejects(bare.workspaces.run(plain.id), { code: 'T9105' })

  // An owner with a role that `trusted` names builds and runs code in the program itself, in no room of the workspaces.
  const staff = await held(t, { trusted: ['staff'], room }, await product(t, join(folder, 'staff')))
  const eve = await userOf(staff, 'eve@example.com', ['staff'])
  const hers = await staff.workspaces.create({ owner: eve, from: 'coded' })
  const counted = rooms.length
  const app = await staff.workspaces.run(hers.id)
  assert.equal(rooms.length, counted, 'no room of the workspaces was made')
  const [row] = Object(
    await app.write([{ add: 'users', values: { email: 'x@example.com', roles: [] } }], { as: 'system' }),
  )
  const key = Object(await app.call('makeKey', { user: Object(row).id }, { as: system }))
  assert.equal(typeof key.key, 'string')
})

test('[22-20] the Sandbox that the makers of the product app made is the one that workspaces use, where none is given', async (t) => {
  const folder = folderOf(t)
  const sandbox = testSandbox(t)
  const built = await buildProject(join(import.meta.dirname, 'product'), { for: 'dev', out: join(folder, 'bundle') })
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const data = join(folder, 'data')
  const app = await engine.open(built.bundleFolder, {
    dataFolder: data,
    mode: 'test',
    makers: { sandbox: () => sandbox },
  })
  const port = Number(JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port)
  const at = await held(t, { room: countedRoom().room }, { engine, app, port, folder })
  const owner = await userOf(at, 'ada@example.com', [])
  const made = await at.workspaces.create({ owner, from: 'coded' })
  await at.workspaces.run(made.id)
  assert.equal(sandbox.started.length, 1)
  assert.equal(sandbox.started[0]?.id, made.id)
})
