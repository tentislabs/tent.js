import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'
import type { App } from '../index.ts'
import type { Running } from './apps.ts'
import { running, send, system } from './apps.ts'
import { partsWithResizer } from './resizerStandIn.ts'

/** The rows of a table of the engine as the data file holds them, read beside the engine. */
function dataRows(dataFolder: string, table: string): Record<string, unknown>[] {
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    return data.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()
  } finally {
    data.close()
  }
}

/** Every file under a folder, with its size. */
function filesUnder(folder: string): { path: string; size: number }[] {
  if (!existsSync(folder)) return []
  return readdirSync(folder, { withFileTypes: true }).flatMap((one) => {
    const path = join(folder, one.name)
    return one.isDirectory() ? filesUnder(path) : [{ path, size: statSync(path).size }]
  })
}

/**
 * A browser of a test: it keeps the cookies it is handed, and sends them with the next request. Its calls name the
 * user that its page was drawn for, as a page does.
 */
function browser(run: Running, user?: string) {
  const cookies = new Map<string, string>()
  const request = async (
    method: string,
    path: string,
    o: { headers?: Record<string, string>; body?: string | Uint8Array<ArrayBuffer> } = {},
  ) => {
    const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    const asked = new Request(`${run.origin}${path}`, {
      method,
      headers: { origin: run.origin, ...(cookie === '' ? {} : { cookie }), ...o.headers },
      ...(o.body === undefined ? {} : { body: o.body }),
    })
    const answer = await run.app.request(asked)
    for (const line of answer.headers.getSetCookie()) {
      const [pair] = line.split(';')
      cookies.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1))
    }
    return answer
  }
  return {
    cookies,
    request,
    async call(name: string, input: object): Promise<Record<string, unknown>> {
      const answer = await request('POST', `/_t/call/${name}`, {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input, ...(user === undefined ? {} : { as: user }) }),
      })
      return Object(await answer.json())
    },
    async upload(bytes: string | Uint8Array<ArrayBuffer>, name: string, kind = 'text/plain'): Promise<string> {
      const body = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
      const answer = await request('POST', `/_t/files?name=${encodeURIComponent(name)}`, {
        headers: { 'content-type': kind, 'content-length': String(body.length) },
        body,
      })
      const wire = Object(await answer.json())
      assert.equal(wire.ok, true, JSON.stringify(wire))
      return String(Object(wire.value).id)
    },
  }
}

/** A browser that signed in as a user, and whose pages are drawn for that user from then on. */
async function signedIn(run: Running, user: string, email: string) {
  const before = browser(run)
  assert.equal((await before.call('signIn', { email })).ok, true)
  const after = browser(run, user)
  for (const [name, value] of before.cookies) after.cookies.set(name, value)
  return after
}

async function userOf(app: App, email: string): Promise<string> {
  return String(Object(await app.call('addUser', { email }, { as: system })).id)
}

/** Sends a command to the admin channel of an app, as a command of this computer does, and answers its value. */
async function did(run: Running, name: string, args: object): Promise<Record<string, unknown>> {
  const token = String(JSON.parse(readFileSync(join(run.dataFolder, 'engine.json'), 'utf8')).token)
  const answered = await send(run.app, `${run.origin}/_t/admin/${name}`, {
    body: JSON.stringify({ args }),
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
  return Object(answered.body.value)
}

test("[20-7@7a] a person's removal: their loose files are gone with their bytes, a file that a row of theirs held goes with the row, and `_t_files` says `removed` where a file that stays named them", async (t) => {
  const run = await running(t, { project: 'stored' })
  const [ada, bob] = [await userOf(run.app, 'ada@example.com'), await userOf(run.app, 'bob@example.com')]
  const [adas, bobs] = [await signedIn(run, ada, 'ada@example.com'), await signedIn(run, bob, 'bob@example.com')]

  const loose = await bobs.upload('a loose file of Bob', 'loose.txt')
  const owned = await bobs.upload('a paper of Bob', 'paper.txt')
  const shown = await bobs.upload('a notice that Bob posted', 'notice.txt')
  const ofAda = await adas.upload('a loose file of Ada', 'ada.txt')
  assert.equal((await bobs.call('keepPaper', { title: 'of Bob', paper: owned })).ok, true)
  assert.equal((await bobs.call('post', { title: 'for all', picture: shown })).ok, true)
  assert.equal(filesUnder(join(run.dataFolder, 'files')).length, 4)
  assert.equal(dataRows(run.dataFolder, '_t_files').filter((row) => row.by === `user:${bob}`).length, 3)

  const removed = await did(run, 'data', { what: 'user', do: 'remove', id: bob, yes: true })
  assert.equal(removed.removed, true)

  const files = new Map(dataRows(run.dataFolder, '_t_files').map((row) => [String(row.id), row]))
  // The loose file of the person, and the one that a row of theirs held, are gone: the row and the bytes.
  assert.deepEqual([files.has(loose), files.has(owned)], [false, false])
  // A file that a row of nobody's holds stays, and names the person no more.
  assert.equal(files.get(shown)?.by, 'removed')
  // The file of another person is as it was.
  assert.equal(files.get(ofAda)?.by, `user:${ada}`)
  assert.equal(filesUnder(join(run.dataFolder, 'files')).length, 2)
  // No row of the files and no hold names the person or a row of theirs any longer.
  assert.equal(
    dataRows(run.dataFolder, '_t_files').some((row) => JSON.stringify(row).includes(bob)),
    false,
  )
  assert.deepEqual(
    dataRows(run.dataFolder, '_t_holds').map((row) => [row.file, row.tableName]),
    [[shown, 'notices']],
  )
  // Everyone still reads the notice, and its file.
  assert.equal((await adas.request('GET', `/_t/files/${shown}`)).status, 200)
  assert.equal((await adas.request('GET', `/_t/files/${loose}`)).status, 404)
})

test('[22-17] the data and the log hold no visitor id as it is: a file of a visitor names the first 32 characters of the fingerprint of the id', async (t) => {
  const run = await running(t, { project: 'stored' })
  const visitor = browser(run)
  const file = await visitor.upload('the file of a guest', 'mine.txt')
  const id = [...visitor.cookies].find(([name]) => name.startsWith('tent_visitor'))?.[1]
  assert.match(String(id), /^[0-9a-hjkmnp-tv-z]{32}$/)
  assert.equal((await visitor.request('GET', `/_t/files/${file}`)).status, 200)
  const [row] = dataRows(run.dataFolder, '_t_files')
  assert.match(String(row.by), /^visitor:[0-9a-f]{32}$/)
  await run.app.close()
  for (const name of ['data.db', 'logs.db'])
    assert.equal(readFileSync(join(run.dataFolder, name)).includes(String(id)), false, `${name} holds the visitor id`)
})

/** One part of a PNG picture: its length, its name, its bytes and their check. */
function part(name: string, data: Uint8Array): Uint8Array {
  const body = Buffer.concat([Buffer.from(name, 'latin1'), data])
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body) >>> 0, 8 + data.length)
  return out
}

/** A whole PNG picture of a width and a height. */
function picture(width: number, height: number): Uint8Array<ArrayBuffer> {
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head.set([8, 2, 0, 0, 0], 8)
  const lines = Buffer.alloc(height * (1 + width * 3))
  for (let at = 0; at < lines.length; at++) lines[at] = at % (1 + width * 3) === 0 ? 0 : (at * 2654435761) >>> 24
  const mark = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return new Uint8Array(
    Buffer.concat([
      Buffer.from(mark),
      part('IHDR', head),
      part('IDAT', deflateSync(lines)),
      part('IEND', Buffer.alloc(0)),
    ]),
  )
}

test('[22-4] the image door stays under its cache cap under 10,000 requests', async (t) => {
  // A resizer stands in for the one that is fetched, so that the door makes its copies and fetches nothing.
  const run = await running(t, { project: 'stored', engine: { parts: { folder: partsWithResizer(t) } } })
  const ada = await signedIn(run, await userOf(run.app, 'ada@example.com'), 'ada@example.com')
  const ids: string[] = []
  for (let k = 0; k < 20; k++) ids.push(await ada.upload(picture(40 + k, 30), `p${k}.png`, 'image/png'))
  const widths = [320, 640, 960, 1280, 1920, 2560]
  for (let k = 0; k < 10_000; k++) {
    const answer = await ada.request('GET', `/_t/img/${ids[k % ids.length]}?w=${widths[k % widths.length]}`)
    await answer.arrayBuffer()
    if (answer.status !== 200) assert.fail(`request ${k + 1} was answered ${answer.status}`)
  }
  // The scaled copies lie under `cache/` of the data folder: 500 MB at most, where the project states nothing.
  const kept = filesUnder(join(run.dataFolder, 'cache')).reduce((sum, one) => sum + one.size, 0)
  assert.ok(kept <= 500 * 1024 * 1024, `${kept} bytes are kept`)
})

test('[22-12] an upload is closed at the length that it states: what a sender sends past it is not read, and one that sends less is no file', async (t) => {
  const run = await running(t, { project: 'stored' })
  const visitor = browser(run)
  const sent = async (length: number, body: string) => {
    const answer = await visitor.request('POST', '/_t/files?name=stated.txt', {
      headers: { 'content-type': 'text/plain', 'content-length': String(length) },
      body,
    })
    return Object(await answer.json())
  }
  const more = await sent(5, 'hello, and what follows')
  assert.deepEqual([more.ok, Object(more.value).size], [true, 5])
  const read = await visitor.request('GET', `/_t/files/${Object(more.value).id}`)
  assert.equal(await read.text(), 'hello')
  const less = await sent(50, 'too short')
  assert.deepEqual([less.ok, Object(less.error).code], [false, 'T0002'])
  assert.equal(dataRows(run.dataFolder, '_t_files').length, 1)
  // An upload that states no length is refused before a byte of it is read.
  const none = await visitor.request('POST', '/_t/files?name=none.txt', {
    headers: { 'content-type': 'text/plain' },
    body: 'x',
  })
  const told = Object(await none.json())
  assert.equal(Object(told.error).code, 'T0002')
})
