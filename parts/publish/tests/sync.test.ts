import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { writeKey } from '../../engine/index.ts'
import { blobsBody, blobsType } from '../blobsBody.ts'
import { push } from '../index.ts'
import { ada, computer, fetched, folderOf, sent, started } from './server.ts'

const print = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

test('[40-15a] only what the target lacks is sent, a blob larger than syncSize travels alone, and a thousand points travel in pages', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  await here.save()
  const to = server.key(['push'])
  const first = await push({ history: here.history, to, fetch: fetched })
  assert.equal(first.points, 1)
  assert.ok(first.blobs > 4, 'the files and the description of the first point are sent')
  assert.equal(server.history.pointer('main'), here.history.pointer('now'))

  // One file more: the point and its one new blob are sent, and nothing else.
  writeFileSync(join(here.project, 'notes.md'), 'changed\n')
  await here.save()
  const second = await push({ history: here.history, to, fetch: fetched })
  assert.deepEqual([second.points, second.blobs], [1, 1], 'one point and its new file: the description did not change')
  const again = await push({ history: here.history, to, fetch: fetched })
  assert.deepEqual([again.points, again.blobs], [0, 0], 'nothing is sent twice')

  // A file larger than syncSize, as the project states it on the server too: it travels in a request alone.
  const large = new Uint8Array(17 * 1_048_576).fill(7)
  writeFileSync(join(here.project, 'large.bin'), large)
  here.history.record(here.project, { by: ada, kind: 'save', checked: true })
  const big = await push({ history: here.history, to, fetch: fetched })
  assert.equal(big.blobs, 1)
  assert.deepEqual(server.history.blob(print(large))?.length, large.length)

  // A thousand points travel in pages, and the server holds every one.
  for (let n = 0; n < 1000; n++) {
    writeFileSync(join(here.project, 'count.txt'), String(n))
    here.history.record(here.project, { by: ada, kind: 'command', checked: true })
  }
  const many = await push({ history: here.history, to, fetch: fetched })
  assert.equal(many.points, 1000)
  assert.equal(server.history.pointer('main'), here.history.pointer('now'))
  assert.equal(server.history.list({ pointer: 'main' }).length, here.history.list().length)
})

test('[40-15a] [16-2@8c] a key with read cannot push, a key of the API and a request with no key are T9104 at every address of sync', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const head = await here.save()
  const reader = server.key(['read'])
  const refused = await push({ history: here.history, to: reader, fetch: fetched }).then(
    () => 'pushed',
    (error: { code?: string }) => error.code,
  )
  assert.equal(refused, 'T9104')
  assert.equal(server.history.pointer('main'), undefined)

  const api = writeKey(server.app, { name: 'an API key', scopes: ['openOrders'] }).key
  const bytes = new TextEncoder().encode('x')
  const asks: [string, unknown, string?][] = [
    ['/_t/sync/have', { points: [head], blobs: [] }],
    ['/_t/sync/blobs', { want: [print(bytes)] }],
    ['/_t/sync/blobs', blobsBody([[print(bytes), bytes]]), blobsType],
    ['/_t/sync/points', { from: 'main', have: [] }],
    ['/_t/sync/points', { points: [] }],
  ]
  for (const [path, body, type] of asks)
    for (const key of [undefined, api]) {
      const answered = await sent(server, path, body, key, type)
      assert.equal(answered.status, 403, `${path} with ${key ? 'a key of the API' : 'no key'}`)
      assert.equal(Object(answered.answer.error).code, 'T9104')
    }
  // A key with read reads, and is refused what sends.
  const read = await sent(server, '/_t/sync/have', { points: [head], blobs: [] }, reader.key)
  assert.equal(read.status, 200)
  const sending = await sent(server, '/_t/sync/blobs', blobsBody([[print(bytes), bytes]]), reader.key, blobsType)
  assert.equal(Object(sending.answer.error).code, 'T9104')
  assert.deepEqual(Object(sending.answer.error).fields, { right: 'push,publish' })
})

test('[40-15a] a key with push pushes, and a key with a right is nobody at a call', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  await here.save()
  const pusher = server.key(['push'])
  await push({ history: here.history, to: pusher, fetch: fetched })
  assert.equal(server.history.pointer('main'), here.history.pointer('now'))
  const call = await fetch(`${server.address}/_t/call/openOrders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${pusher.key}` },
    body: JSON.stringify({ input: { limit: 5 } }),
  })
  assert.equal(call.status, 401, 'a key of publishing calls no function: it is nobody there')
})

test('[40-15a] [16-2@8c] a blob whose bytes differ, a point whose id does not fit, and one whose parent the server lacks are T9107, and nothing is kept', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  await here.save()
  writeFileSync(join(here.project, 'notes.md'), 'second\n')
  const second = await here.save()
  const { key } = server.key(['push'])

  const bytes = new TextEncoder().encode('the bytes')
  const wrong = await sent(server, '/_t/sync/blobs', blobsBody([['0'.repeat(64), bytes]]), key, blobsType)
  assert.equal(Object(wrong.answer.error).code, 'T9107')
  assert.equal(server.history.blob('0'.repeat(64)), undefined)

  const point = here.history.read(second)
  assert.ok(point)
  // Its blobs are sent, so that only the parent is missing.
  const prints = [...Object.values(point.files ?? {}), ...(point.description ? [point.description] : [])]
  const blobs = prints.map((one): [string, Uint8Array] => [one, here.history.blob(one) ?? new Uint8Array()])
  assert.equal((await sent(server, '/_t/sync/blobs', blobsBody(blobs), key, blobsType)).status, 200)
  const orphan = await sent(server, '/_t/sync/points', { points: [point] }, key)
  assert.equal(Object(orphan.answer.error).code, 'T9107')
  assert.equal(server.history.read(second), undefined)

  const made = await sent(server, '/_t/sync/points', { points: [{ ...point, parents: [], at: point.at + 1 }] }, key)
  assert.equal(Object(made.answer.error).code, 'T9107', 'an id that does not fit what the point holds')
  assert.equal(Object(made.answer.error).fields?.point, point.id)
})
