import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { publish, pull, push } from '../index.ts'
import type { Computer, Server } from './server.ts'
import { ada, computer, fetched, folderOf, sent, started } from './server.ts'

const functions = 'functions/orders.ts'

test('[40-15] a key with publish alone publishes and is refused the source, and one with push cannot publish', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const head = await here.save()
  const pusher = server.key(['read', 'push'])
  const refused = await publish({ project: here.project, history: here.history, to: pusher, fetch: fetched }).then(
    () => undefined,
    (error: { code?: string }) => error.code,
  )
  assert.equal(refused, 'T9104')
  const deploy = server.key(['publish'])
  const done = await publish({ project: here.project, history: here.history, to: deploy, fetch: fetched })
  assert.equal(server.app.versions().find((one) => one.running)?.id, done.version)
  const source = Object.values(here.history.read(head)?.files ?? {})[0]
  const fetchedSource = await sent(server, '/_t/sync/blobs', { want: [source] }, deploy.key)
  assert.equal(Object(fetchedSource.answer.error).code, 'T9104')
  const points = await sent(server, '/_t/sync/points', { from: 'live', have: [] }, deploy.key)
  assert.equal(Object(points.answer.error).code, 'T9104')
})

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

test('[40-8] a pull into a history that holds nothing yet is a merge, and never writes over a change of the files that no point holds', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const to = server.key(['read', 'push'])
  const one = computer(t, folder, 'one')
  await one.save()
  await push({ history: one.history, to, fetch: fetched })
  // Another computer whose history was lost: its files hold a change of its own that no point holds.
  const two = computer(t, folder, 'two')
  two.edit('notes.md', '# Notes', '# Notes\n\nWritten here, and recorded nowhere.')
  await pull({ project: two.project, history: two.history, from: to, fetch: fetched, by: ada })
  assert.match(readFileSync(join(two.project, 'notes.md'), 'utf8'), /recorded nowhere/)
})

test('[40-21] a merge on the server whose merged project cannot be described at all lands nothing: the branch stays where it stood', async (t) => {
  const { server, one, two, to } = await twoComputers(t)
  one.edit(functions, ".limit(input('limit'))", '.limit(50)')
  await one.save()
  // The other side touches another path alone: the file of the project.
  rmSync(join(two.project, 'tent.ts'))
  two.history.record(two.project, { by: ada, kind: 'command', checked: true })
  await push({ history: one.history, to, fetch: fetched })
  const standing = server.history.pointer('main')
  const refused = await refusal(push({ history: two.history, to, fetch: fetched }))
  assert.notEqual(refused, undefined, 'the push is refused')
  assert.equal(server.history.pointer('main'), standing, 'nothing on the server moves')
})
