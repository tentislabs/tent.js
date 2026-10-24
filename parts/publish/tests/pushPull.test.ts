import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { pull, push } from '../index.ts'
import { ada, computer, describedNow, fetched, folderOf, started } from './server.ts'

const functions = 'functions/orders.ts'

test('[40-8] a server-side edit of a plain definition pulled into a hand-edited file 100 times lands, and nothing else in the file changes', async (t) => {
  const folder = folderOf(t)
  // A hundred pushes and pulls in a minute pass the count of a key that a server holds where it states none.
  const server = await started(t, folder, { limits: '{ syncPerMinute: 100_000 }' })
  const to = server.key(['read', 'push'])
  const hand = computer(t, folder, 'hand')
  const tool = computer(t, folder, 'tool')
  await hand.save()
  await push({ history: hand.history, to, fetch: fetched })
  await pull({ project: tool.project, history: tool.history, from: to, fetch: fetched, by: ada })
  // A hand changes the file around the definition: a comment, blank lines, a layout of its own.
  hand.edit(
    functions,
    "export const addOrder = change('addOrder', {",
    "// Orders are added by a signed-in caller.\n\n\nexport const addOrder = change('addOrder', {",
  )
  hand.edit(
    functions,
    '    const first = given.order.trim()',
    '    const first = given.order.trim() // the order as it was typed',
  )
  await hand.save()
  let limit = "input('limit')"
  for (let n = 1; n <= 100; n++) {
    // The other side edits the definition as a tool does.
    tool.edit(functions, `.limit(${limit})`, `.limit(${n})`)
    limit = String(n)
    await tool.save()
    await push({ history: tool.history, to, fetch: fetched })
    const before = readFileSync(join(hand.project, functions), 'utf8')
    const merged = await pull({ project: hand.project, history: hand.history, from: to, fetch: fetched, by: ada })
    assert.deepEqual(merged.clashes, [], `pull ${n}`)
    const after = readFileSync(join(hand.project, functions), 'utf8')
    const expected = before.replace(/\.limit\((input\('limit'\)|\d+)\)/, `.limit(${n})`)
    assert.equal(after, expected, `pull ${n}: the edit lands and nothing else in the file changes`)
    assert.equal(
      merged.point?.checked,
      undefined,
      `pull ${n}: the pulled point is not checked until this computer checked it`,
    )
    hand.history.mark('now', { checked: true, description: await describedNow(hand.project) })
  }
})

test('[40-8] [16-2@8c] a push after someone else pushed is T9103, and after a pull it lands; a pulled point is not checked until this computer checked it', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const to = server.key(['read', 'push'])
  const one = computer(t, folder, 'one')
  const two = computer(t, folder, 'two')
  await one.save()
  await push({ history: one.history, to, fetch: fetched })
  const pulled = await pull({ project: two.project, history: two.history, from: to, fetch: fetched, by: ada })
  assert.equal(
    pulled.point?.id,
    one.history.pointer('now'),
    'with nothing of its own, the pull is the point of the server',
  )
  assert.equal(two.history.read(String(two.history.pointer('now')))?.checked, undefined, 'it is not checked here yet')

  // Both change one code definition, so both touched one path.
  one.edit(functions, 'const second = first.toUpperCase()', 'const second = first.toLowerCase()')
  await one.save()
  two.edit(functions, "const fourth = third.padEnd(8, '-')", "const fourth = third.padEnd(10, '-')")
  await two.save()
  await push({ history: one.history, to, fetch: fetched })
  const standing = server.history.pointer('main')
  const refused = await push({ history: two.history, to, fetch: fetched }).then(
    () => undefined,
    (error: { code?: string; fields?: object }) => error,
  )
  assert.equal(refused?.code, 'T9103')
  assert.deepEqual(Object(refused?.fields).reason, 'pointer-moved')
  assert.equal(server.history.pointer('main'), standing, 'nothing on the server moves')

  const merged = await pull({ project: two.project, history: two.history, from: to, fetch: fetched, by: ada })
  assert.deepEqual(merged.clashes, [])
  assert.equal(merged.point?.checked, undefined)
  const text = readFileSync(join(two.project, functions), 'utf8')
  assert.ok(text.includes('first.toLowerCase()') && text.includes("padEnd(10, '-')"))
  two.history.mark('now', { checked: true, description: await describedNow(two.project) })
  await push({ history: two.history, to, fetch: fetched })
  assert.equal(server.history.pointer('main'), two.history.pointer('now'), 'after a pull the push lands')
})
