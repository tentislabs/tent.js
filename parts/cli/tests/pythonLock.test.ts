import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { createServer, request } from 'node:http'
import { basename, join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { boolean, list, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import { fetchPart } from '../../engine/index.ts'
import { pinnedArchive } from '../../../rig/offline.ts'
import { pythonStandIn, testPackages, wheelOf } from './pythonStandIn.ts'
import { copied, root, typed } from './typed.ts'

/** Sets variables of the environment for the length of a test, and gives back what stood there. */
function withEnv(t: TestContext, values: Record<string, string | undefined>): void {
  const before = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]))
  const put = (all: Record<string, string | undefined>) => {
    for (const [name, value] of Object.entries(all))
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
  }
  put(values)
  t.after(() => put(before))
}

/** A runner's folder of a test's own, under the folder that git leaves out, so that its parts are fetched anew. */
function freshHome(t: TestContext, name: string): string {
  const all = join(root, 'results', 'cli', 'python-homes')
  mkdirSync(all, { recursive: true })
  const folder = join(mkdtempSync(join(all, 'home-')), name)
  mkdirSync(folder)
  t.after(() => rmSync(join(folder, '..'), { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  return folder
}

/** The Python program of an environment, where the installer laid it on this system. */
const pythonIn = (environment: string): string =>
  process.platform === 'win32' ? join(environment, 'Scripts', 'python.exe') : join(environment, 'bin', 'python')

/** Runs a line of Python in an environment, as nothing of the person's own: answers what it printed. */
function ranIn(environment: string, line: string): string {
  const done = spawnSync(pythonIn(environment), ['-I', '-c', line], { encoding: 'utf8', timeout: 60_000 })
  assert.equal(done.status, 0, done.stderr)
  return done.stdout.trim()
}

/** The tag that the installer picks of a package with a file for each of six systems, on this one. */
const tags: Record<string, string> = {
  'win32-x64': 'win_amd64',
  'win32-arm64': 'win_arm64',
  'linux-x64': 'manylinux_2_17_x86_64.manylinux2014_x86_64',
  'linux-arm64': 'manylinux_2_17_aarch64.manylinux2014_aarch64',
  'darwin-arm64': 'macosx_11_0_arm64',
  'darwin-x64': 'macosx_10_12_x86_64',
}
const tagHere = tags[`${process.platform}-${process.arch}`] ?? 'none'

/** The folder of the environment that a lock is made into: the first sixteen characters of its fingerprint. */
const environmentOf = (home: string, lock: string): string =>
  join(home, 'fetched', 'python-envs', createHash('sha256').update(readFileSync(lock)).digest('hex').slice(0, 16))

/** The paths of the parts that a stand-in was asked for. */
const partsAsked = (asked: { path: string }[]): string[] =>
  asked.map((one) => one.path).filter((path) => /^\/parts\/[^/]+$/.test(path))

const findings = list(object({}))

test('[25-15a] [15-6@9d] tent python lock makes a lock for the project and one for the named lock, for every system from one run, from the two parts it fetches once, in the form of the lock, and prints its shape', async (t) => {
  const stand = await pythonStandIn(t)
  withEnv(t, { TENT_PARTS: stand.parts, TENT_HOME: freshHome(t, 'lock') })
  const project = copied(t, 'python-lock', 'pythonShop')
  const locked = await typed(project, 'python', 'lock', '--json')
  assert.equal(locked.ended, 0, locked.printed)
  const shape = object({ ok: boolean(), value: object({ python: text(), written: list(text()) }), findings })
  assert.deepEqual(checkValue(shape, locked.answer), [], locked.printed)
  assert.deepEqual(locked.answer.value, { python: '3.15', written: ['python.lock', 'python.old.lock'] })
  assert.deepEqual(locked.answer.findings, [])
  const lines = readFileSync(join(project, 'python.lock'), 'utf8').split('\n')
  assert.deepEqual(lines.slice(0, 3), ['# python 3.15', '# packages ["natone"]', 'natone==1.0 \\'])
  // Every file of a package is locked, for each system: six of the one, and one of the other.
  assert.equal(lines.filter((line) => /^ {4}--hash=sha256:[0-9a-f]{64}( \\)?$/.test(line)).length, 7)
  assert.ok(lines.includes('tinyone==2.0 \\'))
  const old = readFileSync(join(project, 'python.old.lock'), 'utf8').split('\n')
  assert.deepEqual(old.slice(0, 3), ['# python 3.15', '# packages ["tinyone==1.0"]', 'tinyone==1.0 \\'])
  // Each of the two parts was fetched once, and is not fetched again for a second lock.
  const parts = partsAsked(stand.asked)
  assert.equal(parts.length, 2, parts.join(', '))
  assert.ok(parts.some((path) => path.includes('uv-')))
  assert.ok(parts.some((path) => path.includes('cpython-3.15')))
  assert.equal((await typed(project, 'python', 'lock')).ended, 0)
  assert.equal(partsAsked(stand.asked).length, 2)
  // With its locks the project builds, and its bundle holds both.
  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  assert.ok(existsSync(join(built.bundleFolder, 'python', 'python.old.lock')))
})

test('[25-15a] a package with no ready-built file for a system is a warning of tent python lock that names each such system, and two definitions that need two versions of one package are named by it, with no lock written', async (t) => {
  const stand = await pythonStandIn(t)
  withEnv(t, { TENT_PARTS: stand.parts, TENT_HOME: freshHome(t, 'warn') })
  const project = copied(t, 'python-warn', 'pythonShop')
  const functions = join(project, 'functions.ts')
  writeFileSync(
    functions,
    readFileSync(functions, 'utf8').replace("packages: ['natone']", "packages: ['natone', 'winonly']"),
  )
  const warned = await typed(project, 'python', 'lock', '--json')
  assert.equal(warned.ended, 0, warned.printed)
  const told = (warned.answer.findings ?? []).filter((one) => one.level === 'warning')
  for (const system of ['win32-arm64', 'darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64'])
    assert.ok(
      told.some((one) => one.message.includes('winonly') && one.message.includes(system)),
      `the warning names ${system}`,
    )
  assert.equal(
    told.some((one) => one.message.includes('win32-x64')),
    false,
  )
  assert.match(readFileSync(join(project, 'python.lock'), 'utf8'), /^winonly==1\.0 \\$/m)

  const clash = copied(t, 'python-clash', 'pythonShop')
  writeFileSync(
    join(clash, 'clash.ts'),
    "import { number, python } from 'tentjs'\n\n" +
      "export const newer = python('newer', { file: 'score.py', packages: ['tinyone>=2'], input: {}, output: number(), access: 'signedIn' })\n" +
      "export const older = python('older', { file: 'score.py', packages: ['tinyone<2'], input: {}, output: number(), access: 'signedIn' })\n",
  )
  const refused = await typed(clash, 'python', 'lock', '--json')
  assert.notEqual(refused.ended, 0)
  const [error] = (refused.answer.findings ?? []).filter((one) => one.level === 'error')
  assert.equal(error?.code, 'T7020')
  assert.match(error?.message ?? '', /newer/)
  assert.match(error?.message ?? '', /older/)
  assert.match(error?.fix ?? '', /lock/)
  assert.equal(existsSync(join(clash, 'python.lock')), false)
})

test('[25-12] python.build reaches the installer: a source package that it names is built where no ready-built file exists, and one that it does not name is refused without being built', async (t) => {
  const stand = await pythonStandIn(t)
  withEnv(t, { TENT_PARTS: stand.parts, TENT_HOME: freshHome(t, 'build') })
  const project = copied(t, 'python-build', 'pythonShop')
  const functions = join(project, 'functions.ts')
  writeFileSync(functions, readFileSync(functions, 'utf8').replace("packages: ['natone']", "packages: ['sdistonly']"))
  // The project names it in `build`: the installer reaches for what builds it, which the index does not hold.
  const named = await typed(project, 'python', 'lock', '--json')
  assert.notEqual(named.ended, 0)
  assert.ok(
    stand.asked.some((one) => one.path === '/parts/simple/setuptools/'),
    'the installer went to build it',
  )
  const tent = join(project, 'tent.ts')
  writeFileSync(tent, readFileSync(tent, 'utf8').replace(", build: ['sdistonly']", ''))
  stand.asked.length = 0
  const unnamed = await typed(project, 'python', 'lock', '--json')
  assert.notEqual(unnamed.ended, 0)
  const [error] = unnamed.answer.findings ?? []
  assert.equal(error?.code, 'T7020')
  assert.match(error?.message ?? '', /sdistonly/)
  assert.equal(
    stand.asked.some((one) => one.path.includes('setuptools')),
    false,
    'nothing was built',
  )
  assert.equal(existsSync(join(project, 'setup-was-run')), false)
})

test('[25-15a] [15-6@9d] tent python install makes each environment ahead from its lock alone, with the files of this system, two projects with one lock make one environment, a bundle is installed as its project is, and the shape is printed', async (t) => {
  const stand = await pythonStandIn(t)
  const home = freshHome(t, 'install')
  withEnv(t, { TENT_PARTS: stand.parts, TENT_HOME: home })
  const project = copied(t, 'python-install', 'pythonShop')
  assert.equal((await typed(project, 'python', 'lock')).ended, 0)
  const installed = await typed(project, 'python', 'install', '.', '--json')
  assert.equal(installed.ended, 0, installed.printed)
  const shape = object({
    ok: boolean(),
    value: object({ environments: list(object({ lock: text(), folder: text(), made: boolean() })) }),
    findings,
  })
  assert.deepEqual(checkValue(shape, installed.answer), [], installed.printed)
  const own = environmentOf(home, join(project, 'python.lock'))
  const old = environmentOf(home, join(project, 'python.old.lock'))
  assert.deepEqual(installed.answer.value, {
    environments: [
      { lock: 'python.lock', folder: own, made: true },
      { lock: 'python.old.lock', folder: old, made: true },
    ],
  })
  assert.equal(ranIn(own, 'import natone, tinyone; print(natone.TAG, tinyone.VALUE)'), `${tagHere} 2`)
  assert.equal(ranIn(old, 'import tinyone; print(tinyone.VALUE)'), '1')
  // The environment runs the pinned Python, and nothing of a Python of the person's own.
  assert.match(ranIn(own, 'import sys; print(sys.version)'), /^3\.15\./)
  // A second project with the same lock is handed the same environment, and so is the bundle of the first.
  const twin = copied(t, 'python-install-twin', 'pythonShop')
  for (const file of ['python.lock', 'python.old.lock']) cpSync(join(project, file), join(twin, file))
  const again = await typed(twin, 'python', 'install', '.', '--json')
  assert.deepEqual(again.answer.value, {
    environments: [
      { lock: 'python.lock', folder: own, made: false },
      { lock: 'python.old.lock', folder: old, made: false },
    ],
  })
  const built = await buildProject(project, { for: 'dev' })
  const bundled = await typed(project, 'python', 'install', built.bundleFolder, '--json')
  assert.equal(bundled.ended, 0, bundled.printed)
  assert.deepEqual(
    Object(bundled.answer.value).environments.map((one: { made: boolean }) => one.made),
    [false, false],
  )
  assert.deepEqual(
    readdirSync(join(home, 'fetched', 'python-envs'))
      .filter((name) => !name.startsWith('.'))
      .sort(),
    [basename(own), basename(old)].sort(),
  )
})

test('[25-15a] a part whose bytes do not fit its fingerprint is thrown away, and a package file whose bytes differ from the lock is refused with T0016, each leaving nothing half', async (t) => {
  const stand = await pythonStandIn(t)
  const project = copied(t, 'python-refused', 'pythonShop')
  withEnv(t, { TENT_PARTS: stand.parts, TENT_HOME: freshHome(t, 'refused-lock') })
  assert.equal((await typed(project, 'python', 'lock')).ended, 0)
  // The install is made in a runner's folder of its own, which holds no part yet.
  const home = freshHome(t, 'refused')
  process.env.TENT_HOME = home
  const uvFile = decodeURIComponent(basename(new URL(pinnedArchive('uv').line.from ?? '').pathname))
  const uvBytes = readFileSync(pinnedArchive('uv').file)
  stand.replace(uvFile, new TextEncoder().encode('not the installer'))
  const part = await typed(project, 'python', 'install', '.', '--json')
  assert.notEqual(part.ended, 0)
  assert.equal(part.answer.findings?.[0]?.code, 'T0016')
  assert.match(part.answer.findings?.[0]?.message ?? '', /uv/)
  assert.equal(
    readdirSync(join(home, 'fetched')).some((name) => name.startsWith('uv@')),
    false,
  )

  stand.replace(uvFile, uvBytes)
  stand.replace(
    'tinyone-2.0-py3-none-any.whl',
    wheelOf('tinyone', '2.0', 'py3-none-any', { 'tinyone/__init__.py': 'VALUE = 666\n' }).bytes,
  )
  const differs = await typed(project, 'python', 'install', '.', '--json')
  assert.notEqual(differs.ended, 0)
  assert.equal(differs.answer.findings?.[0]?.code, 'T0016')
  assert.match(differs.answer.findings?.[0]?.message ?? '', /tinyone/)
  const envs = join(home, 'fetched', 'python-envs')
  assert.deepEqual(existsSync(envs) ? readdirSync(envs).filter((name) => !name.startsWith('.')) : [], [
    basename(environmentOf(home, join(project, 'python.old.lock'))),
  ])
  assert.equal(existsSync(environmentOf(home, join(project, 'python.lock'))), false)
})

test('[25-15a] the pinned Python part, which holds links that stay inside it, is taken whole: so is that of macOS, laid on any system', async (t) => {
  const stand = await pythonStandIn(t)
  const home = freshHome(t, 'links')
  const { line, file } = pinnedArchive('python-3.15', 'darwin-arm64')
  stand.replace(decodeURIComponent(basename(new URL(line.from ?? '').pathname)), readFileSync(file))
  const own = {
    name: 'python-mac',
    version: line.version ?? '',
    from: line.from ?? '',
    fingerprint: line.fingerprint ?? '',
  }
  const place = await fetchPart('python-mac', { list: [own], folder: home, from: stand.parts, mode: 'live' })
  for (const [link, to] of [
    ['python/bin/python3', 'python/bin/python3.15'],
    ['python/bin/python', 'python/bin/python3.15'],
    ['python/bin/pydoc3', 'python/bin/pydoc3.15'],
  ])
    assert.deepEqual(readFileSync(join(place, link)), readFileSync(join(place, to)), link)
  // This system's own Python is taken too.
  const here = await fetchPart('python-3.15', { folder: home, from: stand.parts, mode: 'live' })
  assert.ok(existsSync(join(here, 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3')))
})

test('[25-15a] an install under a user folder whose name holds letters that are not English works', async (t) => {
  const stand = await pythonStandIn(t)
  const home = freshHome(t, 'Kullanıcı Ölçü 日本')
  withEnv(t, { TENT_PARTS: stand.parts, TENT_HOME: home })
  const project = copied(t, 'python-letters', 'pythonShop')
  assert.equal((await typed(project, 'python', 'lock')).ended, 0)
  const installed = await typed(project, 'python', 'install', '.', '--json')
  assert.equal(installed.ended, 0, installed.printed)
  assert.equal(ranIn(environmentOf(home, join(project, 'python.lock')), 'import tinyone; print(tinyone.VALUE)'), '2')
})

test('[25-15a] the proxy that the environment names is the one the installer is started with', async (t) => {
  const stand = await pythonStandIn(t)
  // A proxy for plain requests, which writes down each address it carries on.
  const carried: string[] = []
  const proxy = createServer((asked, answer) => {
    carried.push(asked.url ?? '')
    const to = new URL(asked.url ?? '')
    const onward = request(
      { host: to.hostname, port: to.port, path: to.pathname + to.search, method: asked.method, headers: asked.headers },
      (got) => {
        answer.writeHead(got.statusCode ?? 502, got.headers)
        got.pipe(answer)
      },
    )
    asked.pipe(onward)
  })
  await new Promise<void>((done) => proxy.listen(0, '127.0.0.1', done))
  t.after(() => new Promise<void>((done) => proxy.close(() => done())))
  const port = Object(proxy.address()).port
  const parts = stand.parts.replace('127.0.0.1', 'localhost')
  // A name of the environment is one name in any capitals on Windows: there the small form is that same name.
  const small = process.platform === 'win32' ? {} : { http_proxy: undefined, no_proxy: undefined }
  withEnv(t, {
    TENT_PARTS: parts,
    TENT_HOME: freshHome(t, 'proxy'),
    ...small,
    HTTP_PROXY: `http://127.0.0.1:${port}`,
    NO_PROXY: '',
  })
  const project = copied(t, 'python-proxy', 'pythonShop')
  const locked = await typed(project, 'python', 'lock', '--json')
  assert.equal(locked.ended, 0, locked.printed)
  assert.ok(
    carried.some((one) => one.startsWith(`${parts}/simple/`)),
    `the installer asked the index through the proxy: ${carried.join(', ')}`,
  )
})

test('[25-15a] a project that names a pinned Python gets a lock for it, which is installed with that Python, and one that names another is T7020, which lists the pinned ones', async (t) => {
  const stand = await pythonStandIn(t)
  const home = freshHome(t, 'versions')
  withEnv(t, { TENT_PARTS: stand.parts, TENT_HOME: home })
  const older = copied(t, 'python-older', 'pythonShop')
  const tent = join(older, 'tent.ts')
  writeFileSync(tent, readFileSync(tent, 'utf8').replace("version: '3.15'", "version: '3.14'"))
  assert.equal((await typed(older, 'python', 'lock')).ended, 0)
  assert.match(readFileSync(join(older, 'python.lock'), 'utf8'), /^# python 3\.14\n/)
  assert.equal((await typed(older, 'python', 'install', '.')).ended, 0)
  assert.match(ranIn(environmentOf(home, join(older, 'python.lock')), 'import sys; print(sys.version)'), /^3\.14\./)

  const other = copied(t, 'python-other', 'pythonShop')
  const its = join(other, 'tent.ts')
  writeFileSync(its, readFileSync(its, 'utf8').replace("version: '3.15'", "version: '3.12'"))
  const refused = await typed(other, 'python', 'lock', '--json')
  assert.notEqual(refused.ended, 0)
  const [error] = refused.answer.findings ?? []
  assert.equal(error?.code, 'T7020')
  assert.match(error?.message ?? '', /3\.12/)
  assert.match(error?.message ?? '', /3\.14/)
  assert.match(error?.message ?? '', /3\.15/)
  assert.equal(existsSync(join(other, 'python.lock')), false)
})

test('[25-15a] [15-6@9d] tent python clean removes an environment that was not used for its time, keeps the one that was, leaves none half, and prints its shape', async (t) => {
  const stand = await pythonStandIn(t, testPackages())
  const home = freshHome(t, 'clean')
  withEnv(t, { TENT_PARTS: stand.parts, TENT_HOME: home })
  const project = copied(t, 'python-clean', 'pythonShop')
  assert.equal((await typed(project, 'python', 'lock')).ended, 0)
  assert.equal((await typed(project, 'python', 'install', '.')).ended, 0)
  const own = environmentOf(home, join(project, 'python.lock'))
  const old = environmentOf(home, join(project, 'python.old.lock'))
  // Nothing was used longer ago than an hour.
  const none = await typed(project, 'python', 'clean', '--older', '1 hour', '--json')
  assert.equal(none.ended, 0, none.printed)
  const shape = object({ ok: boolean(), value: object({ removed: list(text()), kept: list(text()) }), findings })
  assert.deepEqual(checkValue(shape, none.answer), [], none.printed)
  assert.deepEqual(none.answer.value, { removed: [], kept: [old, own].sort() })
  // The one environment was last used forty days ago: the default of thirty days removes it.
  const long = new Date(Date.now() - 40 * 86_400_000)
  for (const name of readdirSync(old)) if (name.startsWith('.tent-')) utimesSync(join(old, name), long, long)
  const cleaned = await typed(project, 'python', 'clean', '--json')
  assert.deepEqual(cleaned.answer.value, { removed: [old], kept: [own] })
  assert.equal(existsSync(old), false)
  assert.deepEqual(readdirSync(join(home, 'fetched', 'python-envs')), [basename(own)])
})
