import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject, describeProject } from '../../build/index.ts'
import { apartRoom, createEngine, writeKey } from '../../engine/index.ts'
import { openHistory } from '../../history/index.ts'
import { serveSync } from '../../publish/index.ts'
import { attacked } from './attacked.ts'
import { closing, folderOf, held, product, templates } from './held.ts'
import { testSandbox } from './sandbox.ts'
import { refusal, toolTemplates } from './tooled.ts'

// The review of the whole, of `workspaces`: what a publish of a workspace holds it to, and what the policy holds.

// A query with no limit, which the build takes and the check refuses (T4004).
const unbounded = `import { query } from 'tentjs'
import { notes } from '../tables/users'

export const everyNote = query('everyNote', { about: 'Every note', access: 'signedIn', rows: notes.where({ body: 'open' }) })
`

test("[40-18a] a workspace whose files fail the check is not published into the product's own engine", async (t) => {
  const at = await product(t, folderOf(t))
  const live = (id: string) => ({
    dataFolder: join(at.folder, 'live', id),
    address: `http://${id}.live.test:${at.port}`,
  })
  const made = await held(t, { live, trusted: ['staff'] }, at)
  const [row] = Object(
    await at.app.write([{ add: 'users', values: { email: 'ada@example.com', roles: ['staff'] } }], { as: 'system' }),
  )
  const workspace = await made.workspaces.create({ owner: String(Object(row).id), from: 'blank' })
  writeFileSync(join(workspace.folder, 'project', 'functions', 'everyNote.ts'), unbounded)
  // `40`, section 8, point 6: "`publish` builds and checks the point and makes it live".
  const done = await made.workspaces.publish(workspace.id).then(
    (published) => `published ${published.version}`,
    (error: { code?: string }) => String(error.code),
  )
  assert.equal(done, 'T9101')
})

test('[40-17] the tool check of a workspace built in a box answers the findings of the check, beside those of the build', async (t) => {
  const sandbox = testSandbox(t)
  const at = await held(
    t,
    { sandbox, room: apartRoom, templates: toolTemplates },
    await product(t, folderOf(t), 'builder'),
  )
  // An owner who holds no role that `trusted` names: the workspace is built in its box.
  const [row] = Object(
    await at.app.write([{ add: 'users', values: { email: 'ada@example.com', roles: [] } }], { as: 'system' }),
  )
  const owner = String(Object(row).id)
  const made = await at.workspaces.create({ owner, from: 'blank' })
  writeFileSync(join(made.folder, 'project', 'functions', 'everyNote.ts'), unbounded)
  const caller = { kind: 'user' as const, user: { id: owner, roles: [] } }
  const told: unknown = await at.workspaces.tool(made.id, 'check', {}, { caller, agent: 'builder' })
  const codes = (Array.isArray(Reflect.get(Object(told), 'findings')) ? Object(told).findings : []).map(
    (one: unknown) => String(Reflect.get(Object(one), 'code')),
  )
  assert.ok(codes.includes('T4004'), `the check answered ${codes.join(', ') || 'nothing'}`)
})

test('[40-20] a workspace of code that was opened again on its last build, after the program started again, is published to a Target', async (t) => {
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
  const options = { sandbox, room: apartRoom, live: () => target }
  const first = await held(t, options)
  const [row] = Object(
    await first.app.write([{ add: 'users', values: { email: 'ada@example.com', roles: [] } }], { as: 'system' }),
  )
  const made = await first.workspaces.create({ owner: String(Object(row).id), from: 'coded' })
  await first.workspaces.run(made.id)
  // The program starts again: the workspaces are made anew over the same folder, and open the build they kept.
  await first.workspaces.close()
  const again = await held(t, options, first)
  await again.workspaces.run(made.id)
  const done = await again.workspaces.publish(made.id).then(
    (published) => published.version,
    (error: { code?: string; message?: string }) => `${error.code} ${error.message}`,
  )
  assert.equal(there.versions().find((one) => one.running)?.id, done)
})

test('[05-16.3] a write of a file that holds no definition, which moves the address of a service outside reaches, is T9105', async (t) => {
  const at = await attacked(t)
  const service = [
    "import { post, service } from 'tentjs'",
    "import { payAt } from './hosts'",
    '',
    "export const pay = service('pay', { url: payAt, calls: { send: post('/x') } })",
    '',
  ].join('\n')
  await at.tool('write', { path: 'functions/hosts.ts', text: "export const payAt = 'https://api.example.com'\n" })
  await at.tool('write', { path: 'functions/pay.ts', text: service })
  const app = await at.workspaces.run(at.made.id)
  assert.equal(Reflect.get(Object(app.description.services.pay), 'url'), 'https://api.example.com')
  // `40`, section 10: "Everything is refused unless the policy allows it"; `05` (section 16), row 3: a service that
  // reaches a host outside `reaches` is refused "whatever the model answered".
  const moved = await refusal(
    at.tool('write', { path: 'functions/hosts.ts', text: "export const payAt = 'https://evil.example'\n" }),
  )
  // The project as the build reads it now: the service of a file the write did not touch reaches the new host.
  const now = (await describeProject(join(at.made.folder, 'project'))).description.services.pay
  assert.deepEqual([moved?.code, Reflect.get(Object(now), 'url')], ['T9105', 'https://api.example.com'])
})

test('[40-18a] a workspace rebuilt after a change of a file that a definition imports runs the definition as its files now give it', async (t) => {
  const at = await held(t)
  const [row] = Object(
    await at.app.write([{ add: 'users', values: { email: 'ada@example.com', roles: ['builder'] } }], { as: 'system' }),
  )
  const made = await at.workspaces.create({ owner: String(Object(row).id), from: 'blank' })
  const functions = join(made.folder, 'project', 'functions')
  writeFileSync(join(functions, 'hosts.ts'), "export const payAt = 'https://one.example.com'\n")
  writeFileSync(
    join(functions, 'pay.ts'),
    "import { post, service } from 'tentjs'\nimport { payAt } from './hosts'\n\nexport const pay = service('pay', { url: payAt, calls: { send: post('/x') } })\n",
  )
  const first = await at.workspaces.run(made.id)
  assert.equal(Reflect.get(Object(first.description.services.pay), 'url'), 'https://one.example.com')
  writeFileSync(join(functions, 'hosts.ts'), "export const payAt = 'https://two.example.com'\n")
  const rebuilt = await at.workspaces.rebuild(made.id, { kind: 'tool' })
  const app = await at.workspaces.run(made.id)
  assert.equal(app.versions().find((one) => one.running)?.id, rebuilt.version)
  assert.equal(Reflect.get(Object(app.description.services.pay), 'url'), 'https://two.example.com')
})
