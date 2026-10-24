import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { gated, got, noted, notesIn, recordOf, signedIn } from './gates.ts'
import type { Siege } from './sieges.ts'
import { closing } from './projects.ts'
import { logOf, wire } from './sieges.ts'

// What a browser sends with a request that a page of another site made: a link that was pressed, and a picture tag.
const pressed = { referer: 'https://evil.example/post', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' }
const picture = {
  referer: 'https://evil.example/post',
  'sec-fetch-site': 'cross-site',
  'sec-fetch-mode': 'no-cors',
  'sec-fetch-dest': 'image',
  accept: 'image/avif,image/webp,*/*',
}

/** Lets what an action started beside its answer come to its end. */
const settled = (): Promise<void> => new Promise((done) => setTimeout(done, 80))

/** The lines of the log of calls that failed, each as its name, its kind and its code. */
const failures = (gate: Siege): string[] =>
  logOf(gate.dataFolder, 'calls')
    .filter((row) => row.ok === 0)
    .map((row) => `${row.name} ${row.kind} ${row.code}`)

/** A server of this computer that counts what it is sent, by its method. It is closed when the test ends. */
async function listener(t: TestContext): Promise<{ port: number; methods: string[] }> {
  const methods: string[] = []
  const server = createServer((request, answer) => {
    methods.push(String(request.method))
    answer.end('taken')
  })
  closing(t, () => new Promise((done) => server.close(() => done(undefined))))
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port }: AddressInfo = Object(server.address())
  return { port, methods }
}

test('[05-4.10] a link on another site, and a picture tag, that point at a screen whose data holds an action that writes: nothing is written, the log holds T0013, and the caller is sent the error screen with T0009', async (t) => {
  const gate = await gated(t)
  await noted(gate, { title: 'the one note' })
  // The visitor of the other site is signed in to the app: the request carries their cookie.
  const { id, cookie } = await signedIn(gate, 'Ada', ['staff'])
  const outside = await listener(t)
  // The attack can get in: the same actions, called by a press, write.
  assert.equal(
    (await wire(gate, { path: '/_t/call/writesByChange', as: id, headers: { cookie, origin: gate.origin } })).status,
    200,
  )
  assert.equal(await notesIn(gate), 2)

  const screens: [string, string][] = [
    ['/writes/change', 'writesByChange'],
    ['/writes/action', 'writesThroughAction'],
    ['/writes/system', 'writesAsSystem'],
    ['/writes/sql', 'writesBySql'],
    [`/writes/post/${outside.port}`, 'posts'],
  ]
  for (const [path, action] of screens)
    for (const [how, headers] of Object.entries({ pressed, picture, own: {} })) {
      const before = failures(gate).length
      const page = await got(gate, path, { ...headers, cookie })
      await settled()
      assert.equal(page.status, 500, `${path} ${how}`)
      const record = recordOf(page.text)
      assert.deepEqual([record.screen, Object(record.error).code], ['tent.error', 'T0009'], `${path} ${how}`)
      assert.ok(!page.text.includes('Never drawn') && !page.text.includes('Posted with'))
      assert.equal(await notesIn(gate), 2, `${path} ${how}: nothing is written`)
      // The log says what was refused: the write, and the action that made it.
      const logged = failures(gate).slice(before)
      assert.ok(
        logged.some((line) => line === `${action} action T0013` || line === `${action} action T0012`),
        `${path} ${how}: ${logged.join(', ')}`,
      )
      if (action !== 'writesBySql' && action !== 'posts')
        assert.ok(logged.includes('addNote change T0013'), logged.join(', '))
    }
  assert.deepEqual(outside.methods, [], 'nothing was sent out')

  // A write that the action leaves for later, after its answer: the page is sent, and the write is refused all the same.
  const later = await got(gate, '/writes/later', { ...pressed, cookie })
  assert.equal(later.status, 200)
  await settled()
  assert.equal(await notesIn(gate), 2)
  assert.ok(failures(gate).includes('addNote change T0013'))
  // An entry that the page does not wait for is not called by the request for the screen at all.
  const calls = logOf(gate.dataFolder, 'calls').length
  assert.equal((await got(gate, '/writes/unwaited', { ...picture, cookie })).status, 200)
  await settled()
  assert.equal(logOf(gate.dataFolder, 'calls').length, calls + 1, 'the screen alone is in the log')
  assert.equal(await notesIn(gate), 2)
})

test('[05-4.10] the same action asked through /_t/read/ is called read-only: nothing is written, the log holds T0013, and the answer is T0009', async (t) => {
  const gate = await gated(t)
  await noted(gate, { title: 'the one note' })
  const { id, cookie } = await signedIn(gate, 'Ada', ['staff'])
  const outside = await listener(t)
  const actions: [string, object][] = [
    ['writesByChange', {}],
    ['writesThroughAction', {}],
    ['writesAsSystem', {}],
    ['writesBySql', {}],
    ['posts', { to: `http://127.0.0.1:${outside.port}/taken` }],
  ]
  for (const [name, input] of actions) {
    const before = failures(gate).length
    // As the page of the app asks it again, and as a program with no `Origin` does.
    const asks: Record<string, string>[] = [{ cookie, origin: gate.origin }, { cookie }, {}]
    for (const headers of asks) {
      // A page of the signed-in browser names the user it was drawn for.
      const answer = await wire(gate, {
        path: `/_t/read/${name}`,
        input,
        headers,
        ...(headers.cookie ? { as: id } : {}),
      })
      await settled()
      assert.deepEqual([answer.status, answer.error.code], [500, 'T0009'], name)
      assert.equal(await notesIn(gate), 1, `${name}: nothing is written`)
    }
    const logged = failures(gate).slice(before)
    assert.ok(
      logged.some((line) => line === `${name} action T0013` || line === `${name} action T0012`),
      `${name}: ${logged.join(', ')}`,
    )
    // From a page of another site, with the visitor's cookie, the read is not carried out at all.
    const calls = logOf(gate.dataFolder, 'calls').filter((row) => row.name === 'addNote').length
    for (const origin of ['https://evil.example', 'null', `http://localhost:${gate.port + 1}`]) {
      const crossed = await wire(gate, { path: `/_t/read/${name}`, input, headers: { cookie, origin } })
      assert.deepEqual([crossed.status, crossed.error.code], [403, 'T0004'], `${name} from ${origin}`)
    }
    assert.equal(logOf(gate.dataFolder, 'calls').filter((row) => row.name === 'addNote').length, calls)
    // A read is a `POST` of JSON: a link, a picture tag and a form are none.
    for (const asked of [
      { method: 'GET' },
      { method: 'HEAD' },
      { headers: { 'content-type': 'text/plain' } },
      { headers: { 'content-type': 'application/x-www-form-urlencoded' } },
    ]) {
      const answer = await wire(gate, {
        path: `/_t/read/${name}`,
        input,
        ...asked,
        headers: { cookie, ...asked.headers },
      })
      assert.equal(answer.status, 404, `${name} ${JSON.stringify(asked)}`)
    }
  }
  await settled()
  assert.equal(await notesIn(gate), 1)
  assert.deepEqual(outside.methods, [])
  // A write that the action leaves for after its answer is refused too.
  assert.deepEqual((await wire(gate, { path: '/_t/read/writesLater' })).body, { ok: true, value: 'answered' })
  await settled()
  assert.equal(await notesIn(gate), 1)
  assert.ok(failures(gate).includes('addNote change T0013'))
  // A change is no read, whoever asks.
  const change = await wire(gate, {
    path: '/_t/read/addNote',
    input: { title: 'read as a change' },
    as: id,
    headers: { cookie },
  })
  assert.deepEqual([change.status, change.error.code], [404, 'T0001'])
  assert.equal(await notesIn(gate), 1)
  // And a call of the action, by a press of the app's own page, writes: the rule is the read's, and not the action's.
  assert.equal((await wire(gate, { path: '/_t/call/writesByChange', headers: { origin: gate.origin } })).status, 200)
  assert.equal(await notesIn(gate), 2)
})
