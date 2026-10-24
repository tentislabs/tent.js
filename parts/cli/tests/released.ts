import assert from 'node:assert/strict'
import type { ChildProcess } from 'node:child_process'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import type { TestContext } from 'node:test'
import { brotliDecompressSync } from 'node:zlib'

// The tests of the install build a release of this computer's system from the tree as it stands, once for each
// version and each state of the tree, and share it under `results/` between the test files of one run.
const root = process.cwd()
const here = `${process.platform}-${process.arch}`
const keptIn = join(root, 'results', 'released')

/** The system of this computer, as the runtime names it. */
export const thisSystem = here

/**
 * The fingerprint of every file that a release is made of: the parts but their tests, the install, the lock, and
 * the readme, the licence and the list of borrowed parts that the packages of npm carry.
 */
function treeKey(): string {
  const hash = createHash('sha256')
  const walk = (folder: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (['node_modules', 'tests', 'out', 'results'].includes(entry.name) || entry.name.startsWith('.')) continue
      const path = join(folder, entry.name)
      if (entry.isDirectory()) walk(path)
      else hash.update(`${relative(root, path)}\n`).update(readFileSync(path))
    }
  }
  walk(join(root, 'parts'))
  walk(join(root, 'install'))
  for (const file of ['package-lock.json', 'README.md', 'LICENSE', 'THIRD-PARTY.md'])
    hash.update(readFileSync(join(root, file)))
  return hash.digest('hex').slice(0, 16)
}

/** A key that signs releases, made for the tests alone and kept under `results/`, in the form of a key of a maker. */
interface TestKey {
  file: string
  public: string
  private: string
}

/** Makes a release key for the tests, written as a test key under the folder that git leaves out. */
export function testKey(folder: string, name: string): TestKey {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const jwk = privateKey.export({ format: 'jwk' })
  const raw = (text: unknown): string => Buffer.from(String(text), 'base64url').toString('base64')
  const key = { format: 'tent.maker/1', name: `test-${name}`, public: raw(jwk.x), private: raw(jwk.d) }
  mkdirSync(folder, { recursive: true })
  const file = join(folder, `test-key-${name}.json`)
  writeFileSync(file, `${JSON.stringify(key, null, 2)}\n`)
  assert.equal(publicKey.type, 'public')
  return { file, public: key.public, private: key.private }
}

/** A release made for a test: the folder of its version, the folder of all it wrote, and the key that signed it. */
export interface Released {
  version: string
  out: string
  folder: string
  key: TestKey
  printed: string
}

/** Runs the release script with the words it is handed, and answers what it printed. Throws where it fails. */
export function release(words: string[]): string {
  const done = spawnSync(process.execPath, [join(root, 'install', 'release.mjs'), ...words], {
    cwd: root,
    encoding: 'utf8',
    timeout: 1_200_000,
    maxBuffer: 64 * 1024 * 1024,
  })
  assert.equal(done.status, 0, `the release script failed:\n${done.stdout}\n${done.stderr}`)
  return `${done.stdout}${done.stderr}`
}

/** Waits until a condition holds, by looking again after each short pause, and fails with what it waited for. */
export async function until(holds: () => boolean | Promise<boolean>, what: string, within = 300_000): Promise<void> {
  const ends = Date.now() + within
  while (!(await holds())) {
    if (Date.now() > ends) throw new Error(`waited in vain for ${what}`)
    await new Promise((done) => setTimeout(done, 100))
  }
}

/**
 * Takes a version. Answers the release of this computer's system at that version, signed with a test key: made
 * once for each state of the tree, by the first test file that asks for it, and waited for by every other.
 */
export async function released(version: string, more: string[] = []): Promise<Released> {
  const key = `${treeKey()}-${version}${more.length ? `-${createHash('sha256').update(more.join(' ')).digest('hex').slice(0, 8)}` : ''}`
  const kept = join(keptIn, key)
  const done = join(kept, 'done.json')
  mkdirSync(keptIn, { recursive: true })
  let mine = false
  try {
    mkdirSync(kept)
    mine = true
  } catch {
    // Another test file of this run makes it: it is waited for.
  }
  if (mine) {
    // A release of an earlier state of the tree is of no use any more: each takes some hundred megabytes.
    // One that another test of this run may still read is left: none is read for longer than two hours.
    for (const other of readdirSync(keptIn))
      if (!other.startsWith(key.split('-')[0]) && Date.now() - statSync(join(keptIn, other)).mtimeMs > 7_200_000)
        rmSync(join(keptIn, other), { recursive: true, force: true })
    try {
      const keys = testKey(join(kept, 'keys'), 'release')
      const settings = join(kept, 'settings.json')
      writeFileSync(settings, JSON.stringify({ releaseKeys: [keys.file] }))
      const out = join(kept, 'out')
      const printed = release(['--version', version, '--out', out, '--systems', here, '--settings', settings, ...more])
      writeFileSync(done, JSON.stringify({ version, out, folder: join(out, version), key: keys, printed }))
    } catch (error) {
      writeFileSync(done, JSON.stringify({ failed: String(error) }))
      throw error
    }
  }
  await until(() => existsSync(done), `the release ${version}`, 1_200_000)
  const read = JSON.parse(readFileSync(done, 'utf8'))
  if (read.failed) throw new Error(read.failed)
  return read
}

/** Makes an empty folder for one test in the temporary folder of the system, removed when the test ends. */
export function outsideFolderOf(t: TestContext, name: string): string {
  // Outside the repository, so that nothing of it finds the packages of the repository above it, as on a clean computer.
  const folder = join(tmpdir(), 'tent-install-tests', `${name}-${process.pid}-${Date.now()}`)
  mkdirSync(folder, { recursive: true })
  t.after(async () => {
    // What a test started is ended before its folder goes: a program that runs holds its files.
    await Promise.all((startedBy.get(t) ?? []).map((one) => stopped(one)))
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  })
  return folder
}

/** The folders of a person on a clean computer: a home of their own, and in it the folder of the install. */
export interface Person {
  home: string
  tent: string
  env: Record<string, string>
}

/** The folders of the system that a clean computer's path holds: no Node.js and no Python. */
const systemPath = (): string[] =>
  process.platform === 'win32'
    ? [
        join(process.env.SystemRoot ?? 'C:\\Windows', 'System32'),
        process.env.SystemRoot ?? 'C:\\Windows',
        join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0'),
      ]
    : ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']

/**
 * Takes a folder and whether the person has npm. Answers a person whose own folders lie in it, with the folder of
 * the install as `TENT_HOME`, and the environment their programs run in: nothing of this computer's own folders,
 * nothing that names the framework, and on the path the system's folders, with the runtime and its npm where they
 * have npm.
 */
export function personIn(folder: string, o: { npm: boolean }): Person {
  const home = join(folder, 'person')
  const tent = join(home, 'tent-home')
  for (const one of ['AppData/Roaming', 'AppData/Local', 'temp', 'npm-cache'])
    mkdirSync(join(home, one), { recursive: true })
  const kept = ['SystemRoot', 'SYSTEMROOT', 'windir', 'ComSpec', 'PATHEXT', 'SystemDrive', 'LANG', 'TERM']
  const env: Record<string, string> = {}
  for (const name of kept) if (process.env[name] !== undefined) env[name] = String(process.env[name])
  const path = [...(o.npm ? [dirname(process.execPath)] : []), ...systemPath()]
  Object.assign(env, {
    PATH: path.join(process.platform === 'win32' ? ';' : ':'),
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(home, 'AppData', 'Local'),
    TEMP: join(home, 'temp'),
    TMP: join(home, 'temp'),
    TMPDIR: join(home, 'temp'),
    TENT_HOME: tent,
    npm_config_cache: join(home, 'npm-cache'),
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
  })
  return { home, tent, env }
}

/** What a program printed and how it ended. */
export interface Ran {
  status: number | null
  out: string
  err: string
}

/** Runs a program to its end, with the environment it is handed and a line of input where one is given. */
export function ran(
  program: string,
  words: string[],
  o: { cwd: string; env: Record<string, string>; input?: string; shell?: boolean },
): Promise<Ran> {
  // A program is waited for without holding this one, whose own servers answer it meanwhile.
  return new Promise((done) => {
    const child = spawn(program, words, {
      cwd: o.cwd,
      env: o.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(o.shell ? { shell: true } : {}),
    })
    let out = ''
    let err = ''
    child.stdout.setEncoding('utf8').on('data', (piece: string) => {
      out += piece
    })
    child.stderr.setEncoding('utf8').on('data', (piece: string) => {
      err += piece
    })
    const timer = setTimeout(() => endTree(child.pid), 900_000)
    child.once('error', (error) => {
      clearTimeout(timer)
      done({ status: null, out, err: `${err}${String(error)}` })
    })
    // A program has ended when it ends: a program it left running beside it may hold its output open longer.
    child.once('exit', (status) => {
      clearTimeout(timer)
      const ended = (): void => done({ status, out, err })
      const late = setTimeout(ended, 500)
      child.once('close', () => {
        clearTimeout(late)
        ended()
      })
    })
    // A program that ends before it read what it was handed closes its input: that is its end, and no failure here.
    child.stdin.on('error', () => undefined)
    child.stdin.end(o.input ?? '')
  })
}

/** The program file of npm that the pinned runtime comes with. */
function npmOf(): string {
  const beside = dirname(process.execPath)
  const found = [
    join(beside, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(beside, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].find((one) => existsSync(one))
  if (!found) throw new Error(`no npm lies beside ${process.execPath}`)
  return found
}

/** Runs npm of the pinned runtime for a person. */
export const npm = (person: Person, words: string[], cwd: string, input?: string): Promise<Ran> =>
  ran(process.execPath, [npmOf(), ...words], {
    cwd,
    env: person.env,
    ...(input === undefined ? {} : { input }),
  })

/** A server of this computer, ended with the test. */
interface Served {
  address: string
  close(): Promise<void>
}

/** Starts a server of this computer on a free port, which answers each request by `answer`. Ended with the test. */
async function serving(
  t: TestContext,
  answer: (path: string) => { status: number; type?: string; bytes: Uint8Array } | undefined,
  slow?: (path: string) => boolean,
): Promise<Served> {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://here').pathname)
    const found = answer(path)
    if (!found) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(found.status, { 'content-type': found.type ?? 'application/octet-stream' })
    if (!slow?.(path)) {
      response.end(found.bytes)
      return
    }
    // One byte a second, as a line that is starved.
    let at = 0
    const timer = setInterval(() => {
      if (at >= found.bytes.length || response.destroyed) {
        clearInterval(timer)
        response.end()
        return
      }
      response.write(found.bytes.subarray(at, at + 1))
      at++
    }, 1000)
    response.on('close', () => clearInterval(timer))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  let closed = false
  const close = (): Promise<void> => {
    if (closed) return Promise.resolve()
    closed = true
    server.closeAllConnections()
    return new Promise((done) => server.close(() => done()))
  }
  t.after(close)
  return { address: `http://127.0.0.1:${port}/`, close }
}

/**
 * Serves a folder as the place releases are served from: each file by its path, and `changed` in place of the
 * bytes of the paths it names. `slow` names paths that arrive one byte a second.
 */
export function servedFolder(
  t: TestContext,
  folder: string,
  o: { changed?: Record<string, Uint8Array>; slow?: string[] } = {},
): Promise<Served> {
  return serving(
    t,
    (path) => {
      const name = path.replace(/^\/+/, '')
      if (o.changed && Object.hasOwn(o.changed, name)) return { status: 200, bytes: o.changed[name] }
      const file = join(folder, name)
      if (name === '' || !existsSync(file) || !statSync(file).isFile()) return undefined
      return { status: 200, bytes: readFileSync(file) }
    },
    (path) => o.slow?.includes(path.replace(/^\/+/, '')) ?? false,
  )
}

/** One package that the release packed for npm: its file and its whole package file. */
interface Packed {
  file: string
  manifest: Record<string, unknown>
}

/** Reads what the release wrote of the packages it packed for npm. */
export function packedOf(rel: Released): Packed[] {
  const listed: { file: string; manifest: Record<string, unknown> }[] = JSON.parse(
    readFileSync(join(rel.folder, 'npm', 'packed.json'), 'utf8'),
  )
  return listed.map((one) => ({ file: join(rel.folder, 'npm', one.file), manifest: one.manifest }))
}

/**
 * Serves packages as the npm registry does, from this computer: the record of each name with its versions, and
 * each package file. A name that it does not hold is not found, as an optional package of another system is.
 */
export function registryOf(t: TestContext, packed: Packed[]): Promise<Served> {
  let address = ''
  const named = new Map<string, Packed[]>()
  for (const one of packed) {
    const name = String(one.manifest.name)
    named.set(name, [...(named.get(name) ?? []), one])
  }
  const served = serving(t, (path) => {
    const name = path.replace(/^\/+/, '')
    const tarball = /^(.+)\/-\/([^/]+)$/.exec(name)
    if (tarball) {
      const one = (named.get(tarball[1]) ?? []).find((p) => p.file.endsWith(tarball[2]))
      return one ? { status: 200, bytes: readFileSync(one.file) } : undefined
    }
    const all = named.get(name)
    if (!all) return undefined
    const versions: Record<string, unknown> = {}
    for (const one of all) {
      const bytes = readFileSync(one.file)
      const file = one.file.split(/[\\/]/).at(-1)
      versions[String(one.manifest.version)] = {
        ...one.manifest,
        dist: {
          tarball: `${address}${name}/-/${file}`,
          shasum: createHash('sha1').update(bytes).digest('hex'),
          integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
        },
      }
    }
    const newest = Object.keys(versions)
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      .at(-1)
    const record = { name, 'dist-tags': { latest: newest }, versions }
    return { status: 200, type: 'application/json', bytes: new TextEncoder().encode(JSON.stringify(record)) }
  })
  return served.then((one) => {
    address = one.address
    return one
  })
}

/** Lays a layer of a release into a folder: its bytes opened with Brotli, and the archive unpacked by the system's own `tar`. */
function layIn(folder: string, layer: string): void {
  mkdirSync(folder, { recursive: true })
  const archive = join(folder, `${Date.now()}.tar`)
  writeFileSync(archive, brotliDecompressSync(readFileSync(layer)))
  // The system's own tar: on Windows the one it ships, which reads a drive in a path as a path.
  const tar =
    process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  const done = spawnSync(tar, ['-xf', archive, '-C', folder], { encoding: 'utf8' })
  rmSync(archive, { force: true })
  assert.equal(done.status, 0, `tar did not unpack ${layer}: ${done.stderr}`)
}

/** The launcher in `bin/` of an install. */
export const launcherIn = (home: string): string =>
  process.platform === 'win32' ? join(home, 'bin', 'tent.exe') : join(home, 'bin', 'tent')

/**
 * Lays a direct install of a release into the folder of the install as its installer does: the layers it names
 * into `versions/<version>/`, the launcher into `bin/`, `current`, and `trust.json`.
 */
export function laidInstall(rel: Released, home: string, layers: string[]): string {
  const version = join(home, 'versions', rel.version)
  for (const layer of layers) layIn(version, join(rel.folder, `${layer}-${here}.tar.br`))
  mkdirSync(join(home, 'bin'), { recursive: true })
  const launcher = launcherIn(home)
  if (process.platform === 'win32') {
    for (const one of ['tent.exe', 'tentw.exe'])
      writeFileSync(join(home, 'bin', one), readFileSync(join(rel.folder, 'windows', one)))
  } else {
    writeFileSync(launcher, readFileSync(join(version, 'player', 'launcher', 'tent')))
    spawnSync('chmod', ['755', launcher])
  }
  writeFileSync(join(home, 'current'), `${rel.version}\n`)
  writeFileSync(join(home, 'trust.json'), readFileSync(join(rel.folder, 'trust.json')))
  // The installer makes the folder for the current user alone, and the launcher runs from nothing else.
  if (process.platform === 'win32') {
    const user = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
    const done = spawnSync('icacls', [home, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)F`, '/q'], {
      encoding: 'utf8',
    })
    assert.equal(done.status, 0, done.stdout)
  } else spawnSync('chmod', ['700', home])
  return launcher
}

/** A program that a test started and that is ended with it: what it prints is kept as it arrives. */
export interface Started {
  child: ChildProcess
  said(): string
  ended: Promise<number | null>
}

/** Ends a program that a test started, with every program it started, by its own number. */
function endTree(pid: number | undefined): void {
  if (pid === undefined) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' })
  else
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      // It ended already.
    }
}

// The programs each test started, which are ended with it.
const startedBy = new WeakMap<TestContext, Started[]>()

/** Ends a program that a test started with all it started, and waits for its end, a quarter of a minute at most. */
async function stopped(one: Started): Promise<void> {
  if (one.child.exitCode === null) endTree(one.child.pid)
  await Promise.race([one.ended, new Promise((done) => setTimeout(done, 15_000))])
}

/** Starts a program that does not end by itself, as `tent dev` does. It is ended with the test. */
export function startedIn(
  t: TestContext,
  program: string,
  words: string[],
  o: { cwd: string; env: Record<string, string>; shell?: boolean },
): Started {
  const child = spawn(program, words, {
    cwd: o.cwd,
    env: o.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    ...(o.shell ? { shell: true } : {}),
  })
  let said = ''
  child.stdout?.setEncoding('utf8').on('data', (piece: string) => {
    said += piece
  })
  child.stderr?.setEncoding('utf8').on('data', (piece: string) => {
    said += piece
  })
  const ended = new Promise<number | null>((done) => child.once('exit', (code) => done(code)))
  const one = { child, said: () => said, ended }
  startedBy.set(t, [...(startedBy.get(t) ?? []), one])
  t.after(() => stopped(one))
  return one
}

/**
 * Waits for the engine that `tent dev` runs for a project, by the `engine.json` it writes into the project's
 * `.tent/`, and answers the page at its root once the engine answers it.
 */
export async function pageOf(dev: Started, project: string): Promise<{ status: number; text: string }> {
  const file = join(project, '.tent', 'engine.json')
  let answer: { status: number; text: string } | undefined
  await until(async () => {
    if (dev.child.exitCode !== null) throw new Error(`tent dev ended: ${dev.said()}`)
    if (!existsSync(file)) return false
    try {
      const { port } = JSON.parse(readFileSync(file, 'utf8'))
      const asked = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(10_000) })
      answer = { status: asked.status, text: await asked.text() }
      return asked.status !== 503
    } catch {
      return false
    }
  }, 'the page that tent dev serves')
  assert.ok(answer, `tent dev said: ${dev.said()}`)
  return answer
}

/** The command that runs `tent` of an npm install of a person, through the launcher npm wrote. */
export const npmTent = (prefix: string): string =>
  process.platform === 'win32' ? join(prefix, 'tent.cmd') : join(prefix, 'bin', 'tent')
