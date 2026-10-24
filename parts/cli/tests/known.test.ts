import assert from 'node:assert/strict'
import { createHash, createPrivateKey, sign } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import test from 'node:test'
import { startWords } from './startWords.ts'
import type { Released } from './released.ts'
import {
  outsideFolderOf,
  laidInstall,
  personIn,
  ran,
  released,
  servedFolder,
  startedIn,
  testKey,
  until,
} from './released.ts'

let first: Released | undefined
const made = async (): Promise<Released> => {
  first ??= await released('1.0.0')
  return first
}

/** Writes `known.json` into a served folder, signed with a key of the release, as the owner signs it. */
function knownList(folder: string, rel: Released, o: { made: number; versions: object; key?: Released['key'] }): void {
  mkdirSync(folder, { recursive: true })
  const bytes = Buffer.from(JSON.stringify({ format: 'tent.known/1', made: o.made, versions: o.versions }))
  writeFileSync(join(folder, 'known.json'), bytes)
  const key = o.key ?? rel.key
  const own = createPrivateKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      d: Buffer.from(key.private, 'base64').toString('base64url'),
      x: Buffer.from(key.public, 'base64').toString('base64url'),
    },
    format: 'jwk',
  })
  const print = createHash('sha256').update(Buffer.from(key.public, 'base64')).digest('hex').slice(0, 16)
  writeFileSync(join(folder, 'known.json.sig'), `${print} ${sign(null, bytes, own).toString('base64')}\n`)
}

const problem = { '1.0.0': { problem: 'Uploads over 2 GB are cut short.', fixed: '1.0.1' } }

/** Runs `tent` of a laid install, and answers what it printed and how long it took. */
async function typed(launcher: string, person: ReturnType<typeof personIn>, words: string[], cwd: string) {
  const began = performance.now()
  const done = await ran(launcher, words, { cwd, env: person.env })
  return { ...done, took: performance.now() - began }
}

test('[41-5] an install that is on the list of known problems says so in every command, once it has read the list', async (t) => {
  const rel = await made()
  const folder = outsideFolderOf(t, 'known')
  const person = personIn(folder, { npm: false })
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player'])
  const served = join(folder, 'served')
  knownList(served, rel, { made: 1000, versions: problem })
  const releases = await servedFolder(t, served)
  person.env.TENT_RELEASES = releases.address
  // The first command starts the look, and does not wait for it.
  const look = await typed(launcher, person, ['--help'], person.home)
  assert.equal(look.status, 0, look.err)
  await until(() => existsSync(join(person.tent, 'known.json')), 'the list of known problems to be read', 30_000)
  const kept = JSON.parse(readFileSync(join(person.tent, 'known.json'), 'utf8'))
  assert.equal(typeof kept.readAt, 'number')
  for (const words of [['--help'], ['uninstall'], ['cli', 'list']]) {
    const told = await typed(launcher, person, words, person.home)
    assert.match(told.err, /1\.0\.0[^\n]*Uploads over 2 GB are cut short\.[^\n]*1\.0\.1/)
    assert.equal(told.err.match(/Uploads over 2 GB/g)?.length, 1)
  }
})

test('[41-5] a running engine on the list of known problems says so in its log; with the reading switched off it reads nothing', async (t) => {
  const rel = await made()
  const folder = outsideFolderOf(t, 'known-engine')
  const person = personIn(folder, { npm: false })
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player', 'tools'])
  const served = join(folder, 'served')
  knownList(served, rel, { made: 1000, versions: problem })
  const asked: string[] = []
  const releases = await servedFolder(t, served)
  person.env.TENT_RELEASES = releases.address
  const project = join(person.home, 'shop')
  mkdirSync(project)
  writeFileSync(
    join(project, 'tent.ts'),
    "import { project } from 'tentjs'\n\nexport const shop = project('shop', {})\n",
  )
  const built = await typed(launcher, person, ['build'], project)
  assert.equal(built.status, 0, `${built.out}${built.err}`)
  const engine = startedIn(t, launcher, startWords(['start', '--port', '0', '--data', join(person.home, 'data')]), {
    cwd: project,
    env: person.env,
  })
  await until(() => /known problem/i.test(engine.said()), 'the line of the engine about the known problem', 60_000)
  assert.match(engine.said(), /Uploads over 2 GB are cut short\./)
  // Switched off, nothing is read and nothing is said.
  const off = personIn(join(folder, 'off'), { npm: false })
  const quiet = laidInstall(rel, off.tent, ['runtime', 'player'])
  const counting = createServer((request, response) => {
    asked.push(request.url ?? '')
    response.writeHead(404).end()
  })
  await new Promise<void>((done) => counting.listen(0, '127.0.0.1', done))
  t.after(() => new Promise<void>((done) => counting.close(() => done())))
  off.env.TENT_RELEASES = `http://127.0.0.1:${(counting.address() as AddressInfo).port}/`
  off.env.TENT_NOTICES = 'off'
  writeFileSync(
    join(off.tent, 'known.json'),
    JSON.stringify({ format: 'tent.known/1', made: 1, versions: problem, readAt: 1 }),
  )
  const told = await typed(quiet, off, ['--help'], off.home)
  assert.doesNotMatch(told.err, /Uploads over 2 GB/)
  await new Promise((done) => setTimeout(done, 2000))
  assert.deepEqual(asked, [])
})

test('[41-5] a list with a wrong signature, and an older one, is thrown away; a server that does not answer costs a command no wait', async (t) => {
  const rel = await made()
  const folder = outsideFolderOf(t, 'known-refused')
  const person = personIn(folder, { npm: false })
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player'])
  const served = join(folder, 'served')
  knownList(served, rel, { made: 2000, versions: {} })
  const releases = await servedFolder(t, served)
  person.env.TENT_RELEASES = releases.address
  await typed(launcher, person, ['--help'], person.home)
  await until(() => existsSync(join(person.tent, 'known.json')), 'the first list to be read', 30_000)
  const readAt = (): number => JSON.parse(readFileSync(join(person.tent, 'known.json'), 'utf8')).readAt
  const firstRead = readAt()
  const wait = async (): Promise<void> => {
    // The kept list is a day old, so that the next command looks again.
    const kept = JSON.parse(readFileSync(join(person.tent, 'known.json'), 'utf8'))
    writeFileSync(join(person.tent, 'known.json'), JSON.stringify({ ...kept, readAt: kept.readAt - 2 * 86_400_000 }))
    await typed(launcher, person, ['--help'], person.home)
    await new Promise((done) => setTimeout(done, 3000))
  }
  // A list signed by another key: thrown away, and the one before kept.
  knownList(served, rel, { made: 3000, versions: problem, key: testKey(folder, 'other') })
  await wait()
  assert.deepEqual(JSON.parse(readFileSync(join(person.tent, 'known.json'), 'utf8')).versions, {})
  // An older list, rightly signed: thrown away.
  knownList(served, rel, { made: 1000, versions: problem })
  await wait()
  assert.deepEqual(JSON.parse(readFileSync(join(person.tent, 'known.json'), 'utf8')).versions, {})
  assert.ok(readAt() <= firstRead)
  // A server that takes the connection and never answers costs a command no wait.
  const silent = createServer(() => undefined)
  await new Promise<void>((done) => silent.listen(0, '127.0.0.1', done))
  t.after(() => {
    silent.closeAllConnections()
    return new Promise<void>((done) => silent.close(() => done()))
  })
  person.env.TENT_RELEASES = `http://127.0.0.1:${(silent.address() as AddressInfo).port}/`
  const kept = JSON.parse(readFileSync(join(person.tent, 'known.json'), 'utf8'))
  writeFileSync(join(person.tent, 'known.json'), JSON.stringify({ ...kept, readAt: 0 }))
  const quick = await typed(launcher, person, ['--help'], person.home)
  const plain = await typed(launcher, person, ['--help'], person.home)
  assert.equal(quick.status, 0)
  assert.ok(
    quick.took < plain.took + 2500,
    `a command that looked took ${quick.took} ms, and one that did not ${plain.took} ms`,
  )
})

test('[41-5] where the list of known problems cannot be read, the commands of the next day start no second look', async (t) => {
  const rel = await made()
  const folder = outsideFolderOf(t, 'known-tried')
  const person = personIn(folder, { npm: false })
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player'])
  const asked: string[] = []
  const failing = createServer((request, response) => {
    asked.push(request.url ?? '')
    response.writeHead(503).end()
  })
  await new Promise<void>((done) => failing.listen(0, '127.0.0.1', done))
  t.after(() => new Promise<void>((done) => failing.close(() => done())))
  person.env.TENT_RELEASES = `http://127.0.0.1:${(failing.address() as AddressInfo).port}/`
  await typed(launcher, person, ['--help'], person.home)
  await until(() => existsSync(join(person.tent, 'known.tried')), 'the look that read nothing to be kept', 30_000)
  const looked = asked.length
  assert.ok(looked >= 1, 'the first command looked')
  for (let n = 0; n < 3; n++) await typed(launcher, person, ['--help'], person.home)
  await new Promise((done) => setTimeout(done, 3000))
  assert.equal(asked.length, looked, asked.join(', '))
})
