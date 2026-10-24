import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publish } from '../index.ts'
import { computer, fetched, folderOf, started } from './server.ts'

const functions = 'functions/orders.ts'
const tables = 'tables/orders.ts'

/** What a promise was refused with, or nothing where it was kept. */
const refusal = (
  done: Promise<unknown>,
): Promise<{ code?: string; message?: string; fields?: Record<string, string> } | undefined> =>
  done.then(
    () => undefined,
    (error: { code?: string; message?: string; fields?: Record<string, string> }) => error,
  )

test('[40-15b] the first publish follows a bundle that was brought by hand, and --back switches to the version before, also across an added column', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  const one = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  assert.equal(server.history.pointer('live'), one.point)
  assert.equal(server.app.versions().find((v) => v.running)?.id, one.version)

  here.edit(
    tables,
    '    note: text({ optional: true, max: NOTE_LENGTH }),',
    '    note: text({ optional: true, max: NOTE_LENGTH }),\n    rush: boolean({ optional: true }),',
  )
  await here.save()
  const two = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  assert.equal(server.app.versions().find((v) => v.running)?.id, two.version)
  assert.deepEqual(
    server.history.read(two.point)?.parents,
    [here.history.find('now')?.id, one.point],
    'the parents are the point and what was live',
  )

  const back = await publish({ project: here.project, history: here.history, to, fetch: fetched, back: true })
  assert.equal(back.version, one.version)
  assert.equal(server.app.versions().find((v) => v.running)?.id, one.version)
  assert.equal(server.history.pointer('live'), one.point)
  const again = await refusal(publish({ project: here.project, history: here.history, to, fetch: fetched, back: true }))
  assert.equal(again?.code, 'T9103', 'the first published point has nothing before it')
  assert.equal(again?.fields?.reason, 'nothing')
})

test('[40-5] [16-2@8c] a table change that one live row does not fit is refused with T9103, which names it; try answers it with nothing changed', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  await server.app.write([{ add: 'orders', values: { title: 'one', total: 5, state: 'open' } }], { as: 'system' })
  here.edit(functions, ".limit(input('limit'))", '.limit(9)')
  here.edit(tables, '    note: text({ optional: true, max: NOTE_LENGTH }),', '    note: text({ max: NOTE_LENGTH }),')
  await here.save()
  const running = server.app.versions().find((v) => v.running)?.id
  const live = server.history.pointer('live')
  const tried = await publish({ project: here.project, history: here.history, to, fetch: fetched, try: true })
  assert.match(String(tried.refused), /^rows/)
  const refused = await refusal(publish({ project: here.project, history: here.history, to, fetch: fetched }))
  assert.equal(refused?.code, 'T9103')
  assert.equal(refused?.fields?.reason, 'rows')
  assert.equal(refused?.fields?.count, '1')
  assert.equal(server.app.versions().find((v) => v.running)?.id, running, 'live is untouched')
  assert.equal(server.history.pointer('live'), live)
})
