import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Asking, Siege, Wired } from './sieges.ts'
import { asked, besieged, siegeBundle, wire } from './sieges.ts'

/** What a command of the admin channel is sent with, where it is not the token of the engine from this computer. */
interface Commanding extends Asking {
  // The token that is sent, or none.
  token?: string | null
}

/** The request of a command: `{ "args": { ... } }`, with the token in `Authorization`. */
function commandOf(siege: Siege, name: string, args: object, how: Commanding = {}): Asking {
  const token = how.token === undefined ? siege.token : how.token
  return {
    path: `/_t/admin/${name}`,
    body: JSON.stringify({ args }),
    ...how,
    headers: { ...(token === null ? {} : { authorization: `Bearer ${token}` }), ...how.headers },
  }
}

/** Sends a command over a real connection, which is one of this computer. */
const commanded = (siege: Siege, name: string, args: object, how: Commanding = {}): Promise<Wired> =>
  wire(siege, commandOf(siege, name, args, how))

const seen = (answer: Wired): unknown[] => [answer.status, answer.error.code]

/** Some sets of headers, each as a request holds them. */
const headersOf = (...sets: Record<string, string>[]): Record<string, string>[] => sets

// A command that writes, so that a refusal is seen in the data too.
const writes = { name: 'addWord', with: { text: 'written by a command' } }

const wordsOf = (siege: Siege): Promise<unknown> => siege.app.read({ from: 'words', count: true }, { as: 'system' })

/** A token that differs from the token of the engine in one character alone, at a place. */
function differing(token: string, at: number): string {
  const other = token.at(at) === 'A' ? 'B' : 'A'
  return at === -1 ? token.slice(0, -1) + other : token.slice(0, at) + other + token.slice(at + 1)
}

test('[05-3.1] a command with no token, with a wrong one, and with one that differs in its last character is refused, and the three take the same time', async (t) => {
  const siege = await besieged(t)
  const tokens: Record<string, string | null> = {
    'no token': null,
    'a wrong token': 'x'.repeat(siege.token.length),
    'a token that differs in its last character': differing(siege.token, -1),
    'a token that differs in its first character': differing(siege.token, 0),
  }
  // Over a real connection, from this computer: each is refused, with one answer for all.
  const answers: Wired[] = []
  for (const [what, token] of Object.entries(tokens)) {
    const answer = await commanded(siege, 'run', writes, { token })
    assert.deepEqual(seen(answer), [401, 'T0006'], what)
    answers.push(answer)
  }
  for (const answer of answers) assert.equal(answer.text, answers[0].text)
  assert.equal(await wordsOf(siege), 0)
  // The same token in other places than its header is no token.
  for (const headers of headersOf(
    { authorization: siege.token },
    { authorization: `bearer ${siege.token}` },
    { authorization: `Basic ${Buffer.from(`tent:${siege.token}`).toString('base64')}` },
    { cookie: `token=${siege.token}`, 'x-tent-token': siege.token, 'tent-token': siege.token },
  ))
    assert.deepEqual(seen(await commanded(siege, 'run', writes, { token: null, headers })), [401, 'T0006'])
  const inAddress = await wire(siege, {
    path: `/_t/admin/run?token=${siege.token}&authorization=Bearer%20${siege.token}`,
    body: JSON.stringify({ args: writes, token: siege.token }),
  })
  assert.deepEqual(seen(inAddress), [401, 'T0006'])
  assert.equal(await wordsOf(siege), 0)

  // Timed, with no network between: the kinds take turns, so that what else the computer does falls on each alike.
  const kinds = Object.entries(tokens)
  const times: number[][] = kinds.map(() => [])
  const once = async (token: string | null): Promise<number> => {
    const began = performance.now()
    await asked(siege.app, siege.origin, commandOf(siege, 'run', writes, { token }))
    return performance.now() - began
  }
  for (let round = 0; round < 60; round++) for (const [, token] of kinds) await once(token)
  for (let round = 0; round < 400; round++)
    for (let turn = 0; turn < kinds.length; turn++) {
      const kind = (turn + round) % kinds.length
      times[kind].push(await once(kinds[kind][1]))
    }
  // The middle of each kind, which a slow moment of the computer does not move.
  const middles = times.map((all) => all.sort((a, b) => a - b)[Math.floor(all.length / 2)])
  const [least, most] = [Math.min(...middles), Math.max(...middles)]
  assert.ok(
    most - least < least + 0.1,
    `the middles of the four kinds, in ms: ${middles.map((one) => one.toFixed(4)).join(', ')}`,
  )
})

test('[05-3.2] a command from another computer, and one that came through a proxy, is refused, with the token of the engine', async (t) => {
  // This computer is the named proxy here, so every request over a real connection came through a proxy.
  const behind = await besieged(t, { engine: { proxy: { from: ['127.0.0.1', '10.0.0.1'] } } })
  for (const headers of headersOf(
    {},
    { 'x-forwarded-for': '127.0.0.1' },
    { 'x-forwarded-for': '::1' },
    { 'x-forwarded-for': '203.0.113.9, 127.0.0.1' },
    { 'x-forwarded-for': 'unknown' },
    { 'x-forwarded-for': 'localhost' },
    { forwarded: 'for=127.0.0.1' },
  )) {
    const answer = await commanded(behind, 'run', writes, { headers })
    assert.deepEqual(seen(answer), [401, 'T0006'], JSON.stringify(headers))
  }
  // From another computer, with no network: the address is the one the connection would have.
  const plain = await besieged(t)
  for (const from of [
    '203.0.113.5',
    '192.168.1.7',
    '10.0.0.1',
    '169.254.1.1',
    '0.0.0.0',
    '::',
    'fe80::1',
    '::ffff:10.0.0.1',
  ])
    assert.deepEqual(
      seen(await asked(plain.app, plain.origin, { ...commandOf(plain, 'run', writes), from })),
      [401, 'T0006'],
      from,
    )
  // A header that names this computer, sent from another one to an engine that was told of no proxy, is not read.
  const forged = { 'x-forwarded-for': '127.0.0.1', forwarded: 'for=127.0.0.1', 'x-real-ip': '127.0.0.1' }
  const lied = await asked(plain.app, plain.origin, {
    ...commandOf(plain, 'run', writes, { headers: forged }),
    from: '203.0.113.5',
  })
  assert.deepEqual(seen(lied), [401, 'T0006'])
  assert.equal(await wordsOf(behind), 0)
  assert.equal(await wordsOf(plain), 0)
  // From this computer, through no proxy, the same command is carried out.
  assert.equal((await commanded(plain, 'run', writes)).status, 200)
  assert.equal(await wordsOf(plain), 1)
})

test('[05-3.3] a page in a browser on this computer that calls the admin address is refused: it has no token, and a name of its own is T0017', async (t) => {
  const siege = await besieged(t)
  const page = { origin: 'https://evil.example', referer: 'https://evil.example/page', cookie: 'tent_session=x' }
  // A form and a script of the page: neither can set the token.
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'application/json']) {
    const answer = await commanded(siege, 'run', writes, { token: null, headers: { ...page, 'content-type': type } })
    assert.deepEqual(seen(answer), [401, 'T0006'], type)
    assert.equal(answer.headers['access-control-allow-origin'], undefined, type)
  }
  // The question that a browser asks before it lets a page send a header of its own is answered no.
  const question = await wire(siege, {
    method: 'OPTIONS',
    path: '/_t/admin/run',
    headers: {
      ...page,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, content-type',
    },
  })
  assert.equal(question.status >= 400, true)
  for (const name of Object.keys(question.headers))
    assert.equal(name.startsWith('access-control-'), false, `the answer holds ${name}`)
  // A name of the page's own that leads to this computer, with the port of the engine, is none of the names of the app.
  for (const host of [`rebind.evil.example:${siege.port}`, 'evil.example', `127.0.0.1.evil.example:${siege.port}`]) {
    assert.deepEqual(
      seen(await commanded(siege, 'run', writes, { token: null, host, headers: page })),
      [421, 'T0017'],
      host,
    )
    // Even the token of the engine does not open the channel under such a name.
    assert.deepEqual(seen(await commanded(siege, 'run', writes, { host })), [421, 'T0017'], host)
  }
  assert.equal(await wordsOf(siege), 0)
})

/** Who may read a file, beside its owner: on Windows each line of rights that names another, and elsewhere the bits of the group and of the others. */
function othersOn(file: string): string[] {
  if (process.platform !== 'win32') {
    const others = statSync(file).mode & 0o077
    return others ? [`mode ${others.toString(8)}`] : []
  }
  const rights = execFileSync('icacls', [file], { encoding: 'utf8' })
  const mine = `\\${userInfo().username.toLowerCase()}:`
  return rights
    .split(/\r?\n/)
    .filter((line) => /:\(/.test(line))
    .filter((line) => !line.toLowerCase().includes(mine))
}

test('[05-3.4] another user of this computer who reads engine.json: the file cannot be read by them', async (t) => {
  const siege = await besieged(t)
  const file = join(siege.dataFolder, 'engine.json')
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).token, siege.token)
  assert.deepEqual(othersOn(file), [])
  // The token stands in no other file of the data folder, and in no answer that needs none.
  for (const name of ['logs.db', 'data.db'])
    assert.equal(readFileSync(join(siege.dataFolder, name)).includes(siege.token), false, name)
  const health = await wire(siege, { method: 'GET', path: '/_t/health' })
  assert.equal(health.text.includes(siege.token), false)
})

test('[05-3.4] [05-3.8] an engine.json that stood in the data folder before, open to every user of this computer, is closed to them before the token is written', async (t) => {
  const bundle = await siegeBundle(t)
  const dataFolder = join(bundle, '..', 'data')
  mkdirSync(dataFolder, { recursive: true })
  const file = join(dataFolder, 'engine.json')
  // Left behind by an engine that is gone, and opened to everyone since.
  const gone = spawnSync(process.execPath, ['--version']).pid
  writeFileSync(file, JSON.stringify({ port: 1, token: 'old', pid: gone, mode: 'live' }), { mode: 0o666 })
  if (process.platform === 'win32') execFileSync('icacls', [file, '/grant', '*S-1-1-0:(R)'], { stdio: 'ignore' })
  else execFileSync('chmod', ['666', file])
  assert.notDeepEqual(othersOn(file), [])
  const siege = await besieged(t, { bundle, dataFolder })
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).token, siege.token)
  assert.deepEqual(othersOn(file), [], 'the file that holds the token of the engine is open to another user')
})

test('[05-3.7] a link in the place of engine.json, put there by another user: the engine writes its token through no link', async (t) => {
  const bundle = await siegeBundle(t)
  const dataFolder = join(bundle, '..', 'data')
  mkdirSync(dataFolder, { recursive: true })
  // The link points at a file that is the user's own, in another place: the engine is led to write there.
  const elsewhere = join(bundle, '..', 'a-file-of-the-user.txt')
  writeFileSync(elsewhere, 'what the file held')
  try {
    symlinkSync(elsewhere, join(dataFolder, 'engine.json'), 'file')
  } catch (error) {
    // A system that lets this user make no link has no such attack to try.
    t.diagnostic(`a link could not be made here, so the attack was not tried: ${Reflect.get(Object(error), 'code')}`)
    return
  }
  const opened = await besieged(t, { bundle, dataFolder }).catch(() => undefined)
  const held = readFileSync(elsewhere, 'utf8')
  assert.equal(held, 'what the file held', 'the engine wrote through the link, into a file in another place')
  if (opened) assert.equal(held.includes(opened.token), false)
})

test('[05-3.5] a command whose name holds a slash or dots is not found', async (t) => {
  const siege = await besieged(t)
  const missing = await commanded(siege, 'no-such-command', {})
  assert.deepEqual(seen(missing), [404, 'T0001'])
  for (const name of [
    'data/rows',
    'data%2Frows',
    'data%2frows',
    'data.rows',
    'run.ts',
    'run.',
    '.run',
    'run%2F..',
    '..%2Frun',
    '..%2F..%2Fcall%2FaddWord',
    '%2e%2e%2Frun',
    'run%00',
    'run;x',
    'run%0A',
    'RUN',
    'list',
    'constructor',
    '__proto__',
  ]) {
    const answer = await commanded(siege, name, writes)
    assert.deepEqual(seen(answer), [404, 'T0001'], name)
  }
  // The word that picks one command of several holds neither: it leads to no other file of the engine.
  for (const what of ['../run', 'rows/../../run', '..', 'rows.ts', 'rows/', '/rows', 'rows%2F..', '../../door/call'])
    assert.deepEqual(seen(await commanded(siege, 'data', { what, table: 'words', ...writes })), [404, 'T0001'], what)
  // A name that the address itself folds to another address is that address, and no way round the token.
  const folded = await commanded(
    siege,
    'x/../../call/addWord',
    {},
    { token: null, body: '{"input":{"text":"folded"}}' },
  )
  assert.equal(folded.status, 200)
  const noToken = await commanded(siege, 'x/../run', writes, { token: null })
  assert.deepEqual(seen(noToken), [401, 'T0006'])
  assert.equal(await wordsOf(siege), 1)
})
