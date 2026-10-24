import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { buildProject } from '../index.ts'
import { step as describe } from '../steps/describe.ts'
import { step as find } from '../steps/find.ts'
import { step as load } from '../steps/load.ts'
import { step as server } from '../steps/server.ts'
import { step as sort } from '../steps/sort.ts'
import { step as write } from '../steps/write.ts'
import { newWork } from '../work.ts'
import { copyOf } from './projects.ts'

/** What stands in a stored record at the end of a way of names, or nothing where the way ends early. */
const at = (record: unknown, ...way: string[]): unknown =>
  way.reduce(
    (held: unknown, name) => (typeof held === 'object' && held !== null ? Reflect.get(held, name) : undefined),
    record,
  )

/** Every pair of a module and an export that a stored value names, at any depth. */
function pairs(stored: unknown, found: [string, string][] = []): [string, string][] {
  if (typeof stored !== 'object' || stored === null) return found
  const [module, name] = [Reflect.get(stored, 'module'), Reflect.get(stored, 'export')]
  if (typeof module === 'string' && typeof name === 'string') found.push([module, name])
  for (const one of Object.values(stored)) pairs(one, found)
  return found
}

test('[12-3a] the module of a file exports each rule and each option of its definitions that is code, under the name that the description gives it', async () => {
  for (const kind of ['dev', 'release'] as const) {
    const made = await buildProject(copyOf('exports', `exports-${kind}`), { for: kind })
    assert.deepEqual(made.findings, [], kind)
    const description = made.description
    const exportsOf = async (module: unknown): Promise<Record<string, unknown>> => {
      assert.match(String(module), /^server\/[a-zA-Z.]+\.[0-9a-f]{12}\.js$/, kind)
      return { ...(await import(pathToFileURL(join(made.bundleFolder, String(module))).href)) }
    }
    // The stored record names the module and the export: the module is loaded, and the export is what is called.
    const given = async (name: string, ...way: string[]): Promise<unknown> => {
      const record = at(description, ...way)
      assert.equal(at(record, 'export'), name, `${kind}: ${way.join('.')} names its export`)
      const exported = await exportsOf(at(record, 'module'))
      assert.ok(name in exported, `${kind}: ${at(record, 'module')} exports ${name}, beside ${Object.keys(exported)}`)
      return exported[name]
    }
    const code = async (name: string, ...way: string[]): Promise<(...handed: unknown[]) => unknown> => {
      const exported = await given(name, ...way)
      if (typeof exported !== 'function') throw new Error(`${kind}: ${name} is no function`)
      return (...handed) => exported(...handed)
    }
    const user = { id: 'u1', roles: [] }
    const other = { id: 'u2', roles: [] }

    // A `where` rule of a table, for each of its rules that is code.
    const read = await code('orders_access_read', 'tables', 'orders', 'access', 'read')
    assert.deepEqual(read(user), { placedBy: 'u1' })
    const change = await code('orders_access_change', 'tables', 'orders', 'access', 'change')
    assert.deepEqual(change(other), { placedBy: 'u2', total: { below: 100 } })
    assert.equal(at(description, 'tables', 'orders', 'access', 'read', 'rule'), 'where')
    const add = await code('orders_access_add', 'tables', 'orders', 'access', 'add')
    assert.deepEqual(add(user), { placedBy: 'u1', total: 1 })
    const remove = await code('orders_access_remove', 'tables', 'orders', 'access', 'remove')
    assert.deepEqual(remove(user), { placedBy: 'u1', total: 0 })

    // `allow` and `follow` of a function, and `allow` of a route.
    const access = await code('refund_access', 'functions', 'refund', 'access')
    assert.deepEqual(
      [access(user, { total: 500 }), access(user, { total: 5 }), access(undefined, { total: 500 })],
      [true, false, false],
    )
    const follow = await code('refund_follow', 'functions', 'refund', 'follow')
    assert.deepEqual([follow(undefined, { total: 500 }), follow(user, { total: 500 })], [true, false])
    const feed = await code('feed_access', 'routes', 'feed', 'access')
    assert.deepEqual([feed(user), feed({ id: 'u'.repeat(101), roles: [] })], [false, true])

    // `onFail` and `follow` of a flow whose `run` was read.
    assert.ok(Array.isArray(at(description, 'flows', 'ship', 'body')), 'the run of the flow was read')
    const onFail = await code('ship_onFail', 'flows', 'ship', 'onFail')
    // The file of the flow imports the file of the table, so the builder makes modules that name each other.
    assert.equal(onFail({ failure: { step: 'pack', code: 'T0009', message: '' } }), 'orders failed with T0009')
    const shipped = await code('ship_access', 'flows', 'ship', 'access')
    assert.deepEqual([shipped(user), shipped(other)], [false, true])
    const followed = await code('ship_follow', 'flows', 'ship', 'follow')
    assert.deepEqual([followed(user), followed(other)], [true, false])

    // The rule of an agent, which is stored inside `agent` and written as the option `access`.
    const helper = await code('helper_access', 'flows', 'helper', 'agent', 'access')
    assert.deepEqual([helper(user), helper(other)], [true, false])

    // Two files that import each other: the builder puts both definitions into one module, and each of the two
    // modules still gives the export of its own rule.
    const [aList, bList] = [
      await code('aList_access', 'functions', 'aList', 'access'),
      await code('bList_access', 'functions', 'bList', 'access'),
    ]
    assert.match(String(at(description, 'functions', 'aList', 'access', 'module')), /^server\/functions\.a\./)
    assert.match(String(at(description, 'functions', 'bList', 'access', 'module')), /^server\/functions\.b\./)
    assert.deepEqual([aList({ id: 'bList' }), aList({ id: 'aList' })], [true, false])
    assert.deepEqual([bList({ id: 'aList' }), bList({ id: 'bList' })], [true, false])

    // The rules and the code of `project`.
    const identify = await code('project_identify', 'project', 'identify')
    assert.equal(identify({ request: new Request('http://localhost/', { headers: { 'x-user': 'u7' } }) }), 'u7')
    const onRequest = await code('project_onRequest', 'project', 'onRequest')
    const answered = await onRequest(new Request('http://localhost/'), async () => new Response('went on'))
    assert.equal(answered instanceof Response ? await answered.text() : '', 'went on')
    const uploads = await code('project_uploads', 'project', 'uploads')
    assert.deepEqual([uploads(user), uploads(other)], [true, false])
    const describeTo = await code('project_describeTo', 'project', 'describeTo')
    assert.deepEqual([describeTo(user), describeTo(other)], [false, true])
    // `build` of `project` is a record of code: its export is what the option holds.
    const vite = at(await given('project_build', 'project', 'build'), 'vite')
    assert.deepEqual(typeof vite === 'function' ? vite({ root: '.' }) : undefined, { root: '.', marked: true })

    // Whatever the description names as an export of a module is one, and a module exports nothing beside its
    // definitions and what the description names.
    const named = pairs(description)
    assert.equal(named.length, 19, `${kind}: ${named.map((one) => one[1])}`)
    for (const [module, name] of named)
      assert.ok(name in (await exportsOf(module)), `${kind}: ${module} exports ${name}`)
    assert.deepEqual(
      Object.keys(await exportsOf(at(description, 'tables', 'orders', 'access', 'read', 'module'))).sort(),
      ['notes', 'orders', 'orders_access_add', 'orders_access_change', 'orders_access_read', 'orders_access_remove'],
    )
    assert.deepEqual(Object.keys(await exportsOf(at(description, 'project', 'identify', 'module'))).sort(), [
      'project_build',
      'project_describeTo',
      'project_identify',
      'project_onRequest',
      'project_uploads',
      'shop',
    ])
  }
})

test('[12-3a] an export that the build cannot write into its module is a finding with the definition and the file, and no error of the runtime', async () => {
  const work = newWork(copyOf('exports', 'exports-lost'), { for: 'dev' }, true)
  for (const step of [find, sort, load, describe]) await step.run(work)
  assert.deepEqual([...work.findings], [])
  // The module of the table as the builder made it, but with no export of the table.
  const made = work.made.find((one) => one.name === 'tables.orders.js')
  assert.ok(made?.text.includes('export { notes, orders };'), String(made?.text))
  if (made) made.text = made.text.replace('export { notes, orders };', 'export { notes };')
  await server.run(work)
  assert.deepEqual(
    work.findings
      .map((one) => [one.code, one.level, one.where?.file, one.where?.definition, one.message])
      .sort((a, b) => (String(a[4]) < String(b[4]) ? -1 : 1)),
    ['add', 'change', 'read', 'remove'].map((what) => [
      'T1014',
      'error',
      'tables/orders.ts',
      'orders',
      `orders: the build cannot write the export \`orders_access_${what}\`, since the module of tables/orders.ts does not give \`orders\`.`,
    ]),
  )
  for (const one of work.findings) assert.ok(one.fix)
  // With the error no bundle is written.
  await write.run(work)
  assert.equal(work.bundleFolder, undefined)
})
