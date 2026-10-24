import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import { test } from 'node:test'
import { writeKey } from '../../engine/index.ts'
import type { Point } from '../../history/index.ts'
import { idOf } from '../../history/index.ts'
import { blobsBody, blobsType } from '../blobsBody.ts'
import { pull, push } from '../index.ts'
import type { Server } from './server.ts'
import { ada, computer, fetched, folderOf, sent, started } from './server.ts'

const print = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/** Sends `access-key` to the admin channel of the server, as `tent access key` does. */
async function admin(server: Server, args: object): Promise<void> {
  const token = String(JSON.parse(readFileSync(join(server.data, 'engine.json'), 'utf8')).token)
  const answered = await fetch(`${server.address}/_t/admin/access-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ args }),
  })
  assert.equal(answered.status, 200, await answered.text())
}

/** A point of the server's own form, with an id that fits what it holds. */
function pointOf(held: Omit<Point, 'id'>): Point {
  return { id: idOf(held), ...held }
}

/** What the server holds that a request could have changed: its pointers, its points and its blobs, as one text. */
const heldBy = (server: Server): string =>
  JSON.stringify([server.history.pointers(), server.history.list({ pointer: 'main' }).map((one) => one.id)])

test('[05-15.1] each address of publishing with no key, with a key of the API, with a removed key, and with a key whose right is one too low is T9104, and nothing is read or written', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const head = await here.save()
  await push({ history: here.history, to: server.key(['push']), fetch: fetched })
  const api = writeKey(server.app, { name: 'an API key', scopes: ['*'] }).key
  const removed = writeKey(server.app, { name: 'gone', rights: ['read', 'push', 'publish', 'bundle'] })
  await admin(server, { do: 'remove', name: removed.row.id })
  const bytes = new TextEncoder().encode('a blob that no point names')
  const point = pointOf({ parents: [head], at: 1, by: ada, kind: 'command', files: {} })
  // Each use of an address, with the key whose right is one too low for it.
  const uses: [string, unknown, string, string?][] = [
    ['/_t/sync/have', { points: [head], blobs: [], pointers: true }, 'work'],
    ['/_t/sync/blobs', blobsBody([[print(bytes), bytes]]), 'read', blobsType],
    ['/_t/sync/blobs', { want: Object.values(here.history.read(head)?.files ?? {}) }, 'bundle'],
    ['/_t/sync/points', { points: [point], move: { pointer: 'main', to: point.id, was: head } }, 'read'],
    ['/_t/sync/points', { from: 'main', have: [] }, 'bundle'],
    ['/_t/publish', { point: head, version: 'x', files: {} }, 'push'],
    ['/_t/publish', { back: true }, 'push'],
    ['/_t/publish/values', { kind: 'secret', name: 'MAIL_KEY', value: 'v' }, 'push'],
    ['/_t/publish/values', { list: true }, 'push'],
  ]
  const before = heldBy(server)
  for (const [path, body, low, type] of uses) {
    const lower = writeKey(server.app, { name: `low ${low}`, rights: [low] }).key
    for (const [what, key] of [
      ['no key', undefined],
      ['a key of the API', api],
      ['a removed key', removed.key],
      [`a key of ${low}`, lower],
    ] as const) {
      const answered = await sent(server, path, body, key, type)
      assert.equal(Object(answered.answer.error).code, 'T9104', `${path} with ${what}: ${JSON.stringify(answered)}`)
      assert.equal(JSON.stringify(answered.answer).includes(head), false, `${path} with ${what} reads nothing`)
    }
  }
  assert.equal(heldBy(server), before, 'nothing is written')
  assert.equal(server.history.blob(print(bytes)), undefined)
  assert.equal(server.history.read(point.id), undefined)
})

test('[05-15.2] a key with a right, sent to /_t/call/, /api/ and /_t/files, is nobody: answered as a request with no key', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const asks: [string, string, string?][] = [
    ['POST', '/_t/call/openOrders', JSON.stringify({ input: { limit: 5 } })],
    ['GET', '/api/openOrders?limit=5'],
    ['GET', '/_t/files/f_0123456789abcdef'],
  ]
  const answer = async (method: string, path: string, body: string | undefined, key?: string): Promise<string> => {
    const one = await fetch(`${server.address}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      ...(body === undefined ? {} : { body }),
    })
    const text = (await one.text()).replace(/"(id|at|request)":"[^"]*"/g, '')
    return JSON.stringify([one.status, one.headers.get('www-authenticate'), text])
  }
  for (const rights of [['read'], ['push'], ['publish'], ['bundle'], ['read', 'push', 'publish', 'bundle']]) {
    const { key } = server.key(rights)
    for (const [method, path, body] of asks)
      assert.equal(
        await answer(method, path, body, key),
        await answer(method, path, body),
        `a key of ${rights.join(',')} at ${path}`,
      )
  }
})

test('[05-15.3] a point that names a description the server lacks is T9107, and nothing is kept', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const head = await here.save()
  const { key } = server.key(['push'])
  await push({ history: here.history, to: { address: server.address, key }, fetch: fetched })
  const point = pointOf({ parents: [head], at: 2, by: ada, kind: 'command', files: here.history.read(head)?.files })
  const answered = await sent(server, '/_t/sync/points', { points: [{ ...point, description: '0'.repeat(64) }] }, key)
  assert.equal(Object(answered.answer.error).code, 'T9107', JSON.stringify(answered.answer))
  assert.equal(server.history.read(point.id), undefined)
})

test('[05-15.4] a blob of a gigabyte is T0003 before it is read, and requests past the count of a key are T0005', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder, { limits: '{ syncPerMinute: 20 }' })
  const { key } = server.key(['push'])
  const url = new URL(`${server.address}/_t/sync/blobs`)
  const status = await new Promise<{ status: number; body: string }>((done, failed) => {
    const asking = request(
      {
        host: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: { 'content-type': blobsType, 'content-length': 1_073_741_824 + 100, authorization: `Bearer ${key}` },
      },
      (answer) => {
        let body = ''
        answer.on('data', (chunk) => {
          body += chunk
        })
        answer.on('end', () => done({ status: answer.statusCode ?? 0, body }))
      },
    )
    asking.on('error', failed)
    asking.write(randomBytes(1024))
  })
  assert.equal(JSON.parse(status.body).error.code, 'T0003', status.body)
  const codes: string[] = []
  for (let n = 0; n < 22; n++)
    codes.push(String(Object((await sent(server, '/_t/sync/have', { points: [] }, key)).answer.error).code))
  assert.deepEqual(codes.slice(0, 20), Array(20).fill('undefined'))
  assert.deepEqual(codes.slice(20), ['T0005', 'T0005'])
})

test('[05-15.5] a point whose files hold a path with .., a drive, or a slash at its start is refused, and nothing is written', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const head = await here.save()
  const { key } = server.key(['push'])
  await push({ history: here.history, to: { address: server.address, key }, fetch: fetched })
  const blob = Object.values(here.history.read(head)?.files ?? {})[0]
  for (const path of ['../outside.ts', 'tables/../../outside.ts', 'C:/outside.ts', 'c:outside.ts', '/outside.ts']) {
    const point = pointOf({ parents: [head], at: 3, by: ada, kind: 'command', files: { [path]: blob } })
    const answered = await sent(server, '/_t/sync/points', { points: [point] }, key)
    assert.equal(Object(answered.answer.error).code, 'T9107', `${path}: ${JSON.stringify(answered.answer)}`)
    assert.equal(server.history.read(point.id), undefined)
  }
})

test('[05-15.6] [05-15.18] move of live, now, on, a name that starts at: or seen:, and a name with a slash or a line break is refused with T9103', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const head = await here.save()
  const { key } = server.key(['read', 'push'])
  await push({ history: here.history, to: { address: server.address, key }, fetch: fetched })
  const before = JSON.stringify(server.history.pointers())
  for (const pointer of ['live', 'now', 'on', 'at:http://x', 'seen:http://x:main', 'a/b', 'a\nb', 'bundle:x', ''])
    for (const was of [null, head]) {
      const answered = await sent(server, '/_t/sync/points', { points: [], move: { pointer, to: head, was } }, key)
      assert.equal(
        Object(answered.answer.error).code,
        'T9103',
        `${JSON.stringify(pointer)}: ${JSON.stringify(answered)}`,
      )
    }
  assert.equal(JSON.stringify(server.history.pointers()), before)
})

test('[05-15.12] a copy of the server data holds no key of publishing, but for its fingerprint', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  await here.save()
  const to = server.key(['read', 'push', 'publish'])
  await push({ history: here.history, to, fetch: fetched })
  // The secret of a key is all after the underscore that ends its id: it is written for an address, so it may hold an
  // underscore of its own.
  const secret = to.key.slice(to.key.indexOf('_', 'tent_'.length) + 1)
  assert.equal(secret.length, 43)
  const files = readdirSync(server.data, { recursive: true, withFileTypes: true }).filter((one) => one.isFile())
  for (const one of files) {
    const text = readFileSync(join(one.parentPath, one.name)).toString('latin1')
    assert.equal(text.includes(secret), false, `${one.name} holds the key`)
  }
})

test('[05-15.13] a key with read is handed a file of the source that holds the value of a secret', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  here.edit('notes.md', '# Notes', '# Notes\n\nMAIL_KEY=sk_the_value_of_a_secret')
  const head = await here.save()
  await push({ history: here.history, to: server.key(['push']), fetch: fetched })
  const notes = String(here.history.read(head)?.files?.['notes.md'])
  const reader = server.key(['read'])
  const answer = await fetch(`${server.address}/_t/sync/blobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${reader.key}` },
    body: JSON.stringify({ want: [notes] }),
  })
  assert.ok(
    Buffer.from(await answer.arrayBuffer()).includes('sk_the_value_of_a_secret'),
    'the right is to read the source',
  )
  const page = readFileSync(join(import.meta.dirname, '..', '..', 'docs', 'pages', 'command.access.md'), 'utf8')
  assert.match(page, /`read`[^\n]*source/, 'the docs say so')
})

test('[05-15.16] a point with a made-up by, and one whose description is no description, are taken as the sender word: a merge on the server over it answers T9103 or merges, and is no failure of its own', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const to = server.key(['read', 'push'])
  const one = computer(t, folder, 'one')
  const two = computer(t, folder, 'two')
  await one.save()
  await push({ history: one.history, to, fetch: fetched })
  await pull({ project: two.project, history: two.history, from: to, fetch: fetched, by: ada })
  one.edit('functions/orders.ts', ".limit(input('limit'))", '.limit(50)')
  await one.save()
  await push({ history: one.history, to, fetch: fetched })
  // The other computer sends a point by hand: a made-up writer, and a description that is a text and no description.
  const base = String(two.history.pointer('now'))
  two.edit('notes.md', '# Notes', '# Notes\n\nOne more line.')
  const files = two.history.record(two.project, { by: ada, kind: 'command' }).files ?? {}
  const words = new TextEncoder().encode('"no description"')
  const made = pointOf({ parents: [base], at: 5, by: { kind: 'ai', id: 'someone-else' }, kind: 'command', files })
  const blobs = [...Object.values(files).map((p): [string, Uint8Array] => [p, two.history.blob(p) ?? new Uint8Array()])]
  const { key } = to
  assert.equal(
    (await sent(server, '/_t/sync/blobs', blobsBody([...blobs, [print(words), words]]), key, blobsType)).status,
    200,
  )
  const answered = await sent(
    server,
    '/_t/sync/points',
    { points: [{ ...made, description: print(words) }], move: { pointer: 'main', to: made.id, was: base } },
    key,
  )
  const code = Object(answered.answer.error).code
  assert.ok(
    code === undefined || code === 'T9103',
    `merged or refused, and no failure of its own: ${JSON.stringify(answered.answer)}`,
  )
  assert.deepEqual(
    server.history.read(made.id)?.by,
    { kind: 'ai', id: 'someone-else' },
    'the sender word is kept as it came',
  )
})

test('[05-15.19] a holder of push who sends blobs that no point names is T9103 at syncLooseSize, also after it names them in a point the server holds already, and the app keeps answering', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder, { limits: '{ syncLooseSize: 60000 }' })
  const here = computer(t, folder, 'here')
  const head = await here.save()
  const { key } = server.key(['push'])
  await push({ history: here.history, to: { address: server.address, key }, fetch: fetched })
  const known = here.history.read(head)
  const loose = (n: number): [string, Uint8Array] => {
    const bytes = randomBytes(25_000)
    bytes[0] = n
    return [print(bytes), bytes]
  }
  const sendOne = async (blob: [string, Uint8Array]): Promise<string | undefined> =>
    Object((await sent(server, '/_t/sync/blobs', blobsBody([blob]), key, blobsType)).answer.error).code
  const [a, b, c] = [loose(1), loose(2), loose(3)]
  assert.deepEqual([await sendOne(a), await sendOne(b), await sendOne(c)], [undefined, undefined, 'T9103'])
  // A point the server holds already, sent again with the loose blobs among its files: nothing is taken of it.
  await sent(server, '/_t/sync/points', { points: [{ ...known, files: { x: a[0], y: b[0] } }] }, key)
  const d = loose(4)
  assert.equal(await sendOne(d), 'T9103', 'the blobs are still loose: no point names them')
  const call = await fetch(`${server.address}/_t/health`)
  assert.equal(call.status, 200, 'the app keeps answering')
})

test('[05-15.20] a thousand requests a minute with made-up keys from one address are T0005 by the address', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder, { limits: '{ anyonePerMinute: 30 }' })
  const codes: string[] = []
  for (let n = 0; n < 33; n++) {
    const made = `tent_${randomBytes(13).toString('hex')}_${randomBytes(32).toString('base64url')}`
    codes.push(String(Object((await sent(server, '/_t/sync/have', { points: [] }, made)).answer.error).code))
  }
  assert.ok(
    codes.slice(0, 29).every((one) => one === 'T9104'),
    codes.join(' '),
  )
  assert.deepEqual(codes.slice(31), ['T0005', 'T0005'])
})

test('[05-15.23] a have with a million ids is T0002: a thousand a request', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const { key } = server.key(['read'])
  const million = Array.from({ length: 1_000_000 }, (_, n) => n.toString(36))
  const answered = await sent(server, '/_t/sync/have', { points: million, blobs: [] }, key)
  assert.equal(Object(answered.answer.error).code, 'T0002', JSON.stringify(answered.answer).slice(0, 300))
  const most = Array.from({ length: 1001 }, (_, n) => n.toString(36))
  const over = await sent(server, '/_t/sync/have', { points: [], blobs: most }, key)
  assert.equal(Object(over.answer.error).code, 'T0002')
  const fits = await sent(server, '/_t/sync/have', { points: most.slice(1), blobs: [] }, key)
  assert.equal(fits.status, 200)
})
