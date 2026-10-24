import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { pull, push } from '../index.ts'
import type { Computer, Server } from './server.ts'
import { ada, computer, describedNow, fetched, folderOf, started } from './server.ts'

const functions = 'functions/orders.ts'
const tables = 'tables/orders.ts'

/** A server and two computers that both start from the point the first one pushed. */
async function twoComputers(
  t: TestContext,
): Promise<{ server: Server; one: Computer; two: Computer; to: ReturnType<Server['key']> }> {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const to = server.key(['read', 'push'])
  const one = computer(t, folder, 'one')
  const two = computer(t, folder, 'two')
  await one.save()
  await push({ history: one.history, to, fetch: fetched })
  await pull({ project: two.project, history: two.history, from: to, fetch: fetched, by: ada })
  return { server, one, two, to }
}

/** What a push answers: nothing, or the error it was refused with. */
const refusal = (pushed: Promise<unknown>): Promise<{ code?: string; message?: string; fields?: object } | undefined> =>
  pushed.then(
    () => undefined,
    (error: { code?: string; message?: string; fields?: object }) => error,
  )

test('[40-21] a push to a server whose pointer moved, where the two changed other definitions, is merged by the server, and a pull brings the files of both', async (t) => {
  const { server, one, two, to } = await twoComputers(t)
  one.edit(functions, ".limit(input('limit'))", '.limit(50)')
  await one.save()
  two.edit(
    functions,
    'input: { title: text({ min: 1 }), total: number() }',
    'input: { title: text({ min: 3 }), total: number() }',
  )
  await two.save()
  await push({ history: one.history, to, fetch: fetched })
  const landed = String(server.history.pointer('main'))
  const versions = server.app.versions().length
  await push({ history: two.history, to, fetch: fetched })
  const merged = server.history.read(String(server.history.pointer('main')))
  assert.equal(merged?.kind, 'merge')
  assert.deepEqual(merged?.parents, [landed, two.history.pointer('now')])
  assert.deepEqual(merged?.by, { kind: 'server' })
  assert.equal(merged?.checked, true, 'the server marks it checked')
  assert.equal(server.app.versions().length, versions, 'a merge builds no bundle')
  assert.equal(existsSync(join(server.data, 'build')), false)

  const pulled = await pull({ project: two.project, history: two.history, from: to, fetch: fetched, by: ada })
  assert.equal(pulled.point?.id, merged?.id, 'the pull brings the point the server made')
  const text = readFileSync(join(two.project, functions), 'utf8')
  assert.ok(text.includes('.limit(50)') && text.includes('text({ min: 3 })'), 'the files hold what both changed')
})

test('[40-21] other fields of one definition merge on the server; one field both changed is T9103, and nothing on the server moves', async (t) => {
  const { server, one, two, to } = await twoComputers(t)
  one.edit(functions, ".limit(input('limit'))", '.limit(50)')
  await one.save()
  two.edit(
    functions,
    "  access: 'signedIn',\n  input: { limit: number() },",
    "  access: 'nobody',\n  input: { limit: number() },",
  )
  await two.save()
  await push({ history: one.history, to, fetch: fetched })
  await push({ history: two.history, to, fetch: fetched })
  assert.equal(server.history.read(String(server.history.pointer('main')))?.kind, 'merge')

  // Now both change the limit of the same query.
  await pull({ project: one.project, history: one.history, from: to, fetch: fetched, by: ada })
  one.history.mark('now', { checked: true, description: await describedNow(one.project) })
  await pull({ project: two.project, history: two.history, from: to, fetch: fetched, by: ada })
  two.history.mark('now', { checked: true, description: await describedNow(two.project) })
  one.edit(functions, '.limit(50)', '.limit(60)')
  await one.save()
  two.edit(functions, '.limit(50)', '.limit(70)')
  await two.save()
  await push({ history: one.history, to, fetch: fetched })
  const standing = server.history.pointer('main')
  const refused = await refusal(push({ history: two.history, to, fetch: fetched }))
  assert.equal(refused?.code, 'T9103')
  assert.equal(Object(refused?.fields).reason, 'pointer-moved')
  assert.equal(server.history.pointer('main'), standing)
})

test('[40-21] two pushes at one moment are merged one after the other', async (t) => {
  const { server, one, two, to } = await twoComputers(t)
  const three = computer(t, join(one.project, '..'), 'three')
  await pull({ project: three.project, history: three.history, from: to, fetch: fetched, by: ada })
  one.edit(functions, ".limit(input('limit'))", '.limit(50)')
  await one.save()
  two.edit(
    functions,
    'input: { title: text({ min: 1 }), total: number() }',
    'input: { title: text({ min: 3 }), total: number() }',
  )
  await two.save()
  writeFileSync(join(three.project, 'notes.md'), '# Notes\n\nAnother note.\n')
  await three.save()
  await push({ history: one.history, to, fetch: fetched })
  const answered = await Promise.all([
    refusal(push({ history: two.history, to, fetch: fetched })),
    refusal(push({ history: three.history, to, fetch: fetched })),
  ])
  assert.deepEqual(answered, [undefined, undefined])
  const head = String(server.history.pointer('main'))
  const all = new Set<string>()
  for (const open = [head]; open.length; ) {
    const at = String(open.pop())
    if (all.has(at)) continue
    all.add(at)
    open.push(...(server.history.read(at)?.parents ?? []))
  }
  for (const side of [one, two, three])
    assert.ok(all.has(String(side.history.pointer('now'))), 'each push is in what the branch holds')
})

test('[40-21] two pushes that touch other paths and do not fit - a column renamed beside a query that reads its old name - are T9103 with the finding of the merged project', async (t) => {
  const { server, one, two, to } = await twoComputers(t)
  one.edit(tables, '    title: text({ min: 1, max: 80 }),', "    name: text({ min: 1, max: 80, was: ['title'] }),")
  one.edit(
    functions,
    "set: orders.add({ title: input('title'), total: input('total'), state: 'open' })",
    "set: orders.add({ name: input('title'), total: input('total'), state: 'open' })",
  )
  await one.save()
  writeFileSync(
    join(two.project, 'functions', 'titled.ts'),
    "import { query } from 'tentjs'\nimport { orders } from '../tables/orders'\n\nexport const titled = query('titled', { access: 'signedIn', rows: orders.where({ title: 'first' }) })\n",
  )
  await two.save()
  await push({ history: one.history, to, fetch: fetched })
  const standing = server.history.pointer('main')
  const refused = await refusal(push({ history: two.history, to, fetch: fetched }))
  assert.equal(refused?.code, 'T9103', String(refused?.message))
  assert.equal(Object(refused?.fields).reason, 'check')
  assert.equal(server.history.pointer('main'), standing, 'nothing on the server moves')
})
