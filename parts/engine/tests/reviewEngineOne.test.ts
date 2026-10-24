import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { SecureOptions } from '../certs/keeper.ts'
import { keepCertificates } from '../certs/keeper.ts'
import { proofCertificate } from '../certs/proofCertificate.ts'
import { certKeyText, newCertKey } from '../certs/signed.ts'
import { openLog } from '../log/file.ts'
import { rowsAsText, rowsOfText } from '../rooms/crossing.ts'
import { connect } from 'node:net'
import { logRows, portOf, running, workFolder } from './apps.ts'
import { followedApp } from './followedApp.ts'

test('[05-4.18] an address whose path holds // or a backslash, as written or once its percent signs are read, is not found before a route is asked', async (t) => {
  const { app, origin } = await running(t, { project: 'reviewRouted' })
  const answered = async (path: string) => {
    const answer = await app.request(new Request(`${origin}${path}`))
    return { status: answer.status, text: await answer.text() }
  }
  // The route answers what it is handed: the address it fits.
  assert.deepEqual(await answered('/docs/guide'), { status: 200, text: 'guide' })
  for (const path of ['/docs//evil.example', '/docs/%2Fevil.example', '/docs/a%5Cb'])
    assert.equal((await answered(path)).status, 404, path)
})

test('[05-2.11] an upload whose body arrives slower than web.bodySpeed is closed, as the body of a call is', async (t) => {
  const { dataFolder } = await running(t, {
    change: (description) => Object.assign(description.project, { uploads: { rule: 'anyone', why: 'a test' } }),
    engine: { web: { bodySpeed: '100 KB', bodyCloseAfter: '20 seconds' } },
  })
  const port = portOf(dataFolder)
  /** Sends the head of a request and then one byte each half second: whether the engine closed it within 16 seconds. */
  const closedSlow = async (path: string, type: string): Promise<boolean> => {
    const socket = connect(port, '127.0.0.1')
    const closed = new Promise<boolean>((done) => {
      socket.once('close', () => done(true))
      setTimeout(() => done(false), 16_000).unref()
    })
    socket.write(
      `POST ${path} HTTP/1.1\r\nHost: localhost:${port}\r\nContent-Type: ${type}\r\nContent-Length: 100000\r\n\r\n`,
    )
    // Far below a hundred kB a second, and never quiet for as long as `bodyCloseAfter`.
    const drip = setInterval(() => socket.writable && socket.write(' '), 500)
    const answer = await closed
    clearInterval(drip)
    socket.destroy()
    return answer
  }
  assert.equal(await closedSlow('/_t/call/publicTags', 'application/json'), true, 'the slow call')
  assert.equal(await closedSlow('/_t/files?name=slow.txt', 'text/plain'), true, 'the slow upload')
})

/** Whether the keeper of a folder that holds a certificate due to be renewed tries for a new one at its first look. */
function triesAtStart(t: Parameters<typeof workFolder>[0], names: SecureOptions['names']): boolean {
  const folder = join(workFolder(t), 'certs')
  mkdirSync(folder, { recursive: true })
  const keys = newCertKey()
  // A certificate good for a day, held to be renewed when less than two days of it are left: due at once.
  const cert = proofCertificate('shop.test', 'an answer', keys.privateKey, keys.publicKey)
  writeFileSync(join(folder, 'shop.test.pem'), `${certKeyText(keys.privateKey)}${cert}`)
  const secure: SecureOptions = { names, from: 'https://127.0.0.1:9/directory', renew: '2 days' }
  const keeper = keepCertificates({ secure, folder, say: () => undefined })
  keeper.started(true)
  keeper.close()
  const tries = join(folder, 'tries.json')
  return existsSync(tries) && Object.hasOwn(JSON.parse(readFileSync(tries, 'utf8')), 'shop.test')
}

test('[52-5] the rows of a read that groups cross as they were sent: a moment that the group worked out is a Date on the far side too', () => {
  // A read of `notes` grouped by its tag, with the latest moment of each group: `latest` is no column of the table.
  const answer = [{ tag: 'home', latest: new Date(5) }]
  const written = rowsAsText(answer, { title: { kind: 'text' }, tag: { kind: 'text' } })
  const arrived = written === undefined ? answer : rowsOfText(written.text, written.moments)
  assert.deepEqual(arrived, answer)
})

test('[41-9] a certificate whose life runs out is renewed for a name that secure.names serves as a function, as for a listed one', (t) => {
  assert.equal(triesAtStart(t, ['shop.test']), true, 'a listed name')
  assert.equal(
    triesAtStart(t, (name) => name === 'shop.test'),
    true,
    'a name that a function serves',
  )
})

test('[20-7] the removal of a person writes removed in place of them in every table of the log that names a caller, the model calls among them', (t) => {
  const log = openLog(workFolder(t), 10 * 1024 * 1024)
  log.write('calls', { at: 1, name: 'ask', callerKind: 'user', callerId: 'ada', ms: 1, ok: true })
  log.write('modelCalls', { at: 1, name: 'writer', caller: 'user:ada', kind: 'reply', ms: 1, ok: true })
  log.forget('ada')
  const [calls, models] = [log.rows('calls'), log.rows('modelCalls')]
  log.close()
  assert.equal(calls[0]?.callerId, 'removed')
  assert.doesNotMatch(JSON.stringify(models), /ada/)
})

/** Posts a read to `/_t/read/<name>` as a page of the app does, and answers the body of the answer. */
async function readOf(h: { app: { request(r: Request): Promise<Response> }; origin: string }, name: string) {
  const answer = await h.app.request(
    new Request(`${h.origin}/_t/read/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: h.origin },
      body: JSON.stringify({ input: {} }),
    }),
  )
  return { status: answer.status, body: Object(await answer.json()) }
}

test('[31-11] a page that reads the member working of a flow that states follow at /_t/read/ is answered its runs, as a page with no live connection reads it', async (t) => {
  const h = await followedApp(t)
  const read = await readOf(h, 'visiting.working')
  assert.equal(read.body.ok, true, JSON.stringify(read.body))
  assert.ok(Array.isArray(read.body.value))
})

test('[05-4.19] a form sent with no script that carries the session cookie of the engine and no Origin is refused with T0004', async (t) => {
  const { app, origin } = await running(t)
  const cookie = `tent_session.${app.description.app.name}=a-session-of-the-browser`
  const answer = await app.request(
    new Request(`${origin}/_t/form/addNote`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: 't-at=%2F&title=from+another+site',
    }),
  )
  const body = Object(await answer.json().catch(() => ({})))
  assert.equal(Object(body.error).code, 'T0004', `${answer.status} ${JSON.stringify(body)}`)
})

test('[21-1] an address of the engine whose percent signs stand for no character is not found, and is no failure of the app', async (t) => {
  const { app, origin, dataFolder } = await running(t)
  for (const path of ['/_t/connect/%E0', '/_t/part/%E0']) {
    const answer = await app.request(new Request(`${origin}${path}`))
    const body = Object(await answer.json().catch(() => ({})))
    assert.equal(answer.status, 404, `${path}: ${answer.status} ${JSON.stringify(body)}`)
    assert.equal(Object(body.error).code, 'T0001', path)
  }
  assert.deepEqual(logRows(dataFolder, 'errors'), [])
})

test('[05-2.17] a body that states a Content-Encoding is T0003 at /_t/read/ and at /api/, as at /_t/call/', async (t) => {
  const { app, origin } = await running(t, {
    change: (description) => Object.assign(description.functions.publicTags, { offer: ['api'] }),
  })
  const packed = { 'content-type': 'application/json', 'content-encoding': 'gzip', origin }
  const codes: Record<string, unknown> = {}
  for (const path of ['/_t/call/publicTags', '/_t/read/publicTags', '/api/publicTags']) {
    const body = path.startsWith('/api/') ? '{}' : '{"input":{}}'
    const answer = await app.request(new Request(`${origin}${path}`, { method: 'POST', headers: packed, body }))
    const read = Object(await answer.json().catch(() => ({})))
    codes[path] = read.code ?? Object(read.error).code ?? `${answer.status}`
  }
  assert.deepEqual(codes, {
    '/_t/call/publicTags': 'T0003',
    '/_t/read/publicTags': 'T0003',
    '/api/publicTags': 'T0003',
  })
})

test('[25-6] the token address of sign-in for programs is counted like a request for a screen, for its address, whatever token a sender makes up', async (t) => {
  const { app, origin } = await running(t, {
    change: (description) => {
      Object.assign(description.project, { limits: { screensPerMinute: 3 } })
      Object.assign(description.functions.countNotes, { offer: ['mcp'] })
    },
  })
  const statuses: number[] = []
  for (let k = 0; k < 5; k++) {
    const answer = await app.request(
      new Request(`${origin}/_t/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&client_id=c&refresh_token=tent_made${k}up_${'x'.repeat(43)}`,
      }),
    )
    statuses.push(answer.status)
  }
  assert.deepEqual(statuses, [400, 400, 400, 429, 429])
})
