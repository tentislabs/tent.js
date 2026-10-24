import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import test from 'node:test'
import { measure } from '../../../rig/budgets.ts'
import { buildProject } from '../../build/index.ts'
import { shopIn } from './bundledShop.ts'
import { laidInstall, outsideFolderOf, personIn, ran, released, startedIn, until } from './released.ts'
import { startWords } from './startWords.ts'

// The bars of start, memory and page are held on the app as it ships: a release, whose parts are each one file, run
// by its launcher with the runtime's cache of compiled code on.

/** What `engine.json` of a data folder says, or nothing while there is none. */
function engineOf(dataFolder: string): { pid?: number; port?: number } {
  try {
    return JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  } catch {
    return {}
  }
}

/** Waits until something holds, looking every 10 ms: a wait that looks less often adds its own pause to a measure. */
async function soon(holds: () => Promise<boolean>, what: string, within: number): Promise<void> {
  const ends = Date.now() + within
  while (!(await holds())) {
    if (Date.now() > ends) throw new Error(`waited in vain for ${what}`)
    await new Promise((done) => setTimeout(done, 10))
  }
}

/** The memory that a program holds, in bytes, as the system counts it. */
function memoryOf(pid: number): number {
  if (process.platform === 'win32') {
    const asked = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).WorkingSet64`], {
      encoding: 'utf8',
      windowsHide: true,
    })
    return Number(asked.stdout.trim())
  }
  return Number(spawnSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim()) * 1024
}

test('[21-6] tent start of an install, as it ships, to the first answered request, and the memory of a running app doing nothing, are within their budgets', async (t) => {
  const rel = await released('1.0.0')
  const folder = outsideFolderOf(t, 'shipped-start')
  const person = personIn(folder, { npm: false })
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player'])
  const built = await buildProject(shopIn(folder), { for: 'release' })
  const data = join(folder, 'data')
  const answered = async (port: number | undefined): Promise<boolean> => {
    if (port === undefined) return false
    try {
      return (await fetch(`http://127.0.0.1:${port}/_t/health`)).status === 200
    } catch {
      return false
    }
  }
  const words = startWords(['start', built.bundleFolder, '--data', data, '--port', '0'])
  // Each start is told to end as Ctrl+C ends it, so the runtime writes its cache of compiled code as it does for a
  // person: a program that is ended by force writes none, and every start would compile the code anew.
  const ending = new URL('./endedByFile.ts', import.meta.url).href
  let starts = 0
  const started = (): { run: ReturnType<typeof startedIn>; end: () => Promise<void> } => {
    const file = join(folder, `end-${++starts}`)
    const env = { ...person.env, NODE_OPTIONS: `--import=${ending}`, TENT_TEST_END: file }
    const run = startedIn(t, launcher, words, { cwd: folder, env })
    // Each start has ended before the next one starts on the same data.
    const end = async (): Promise<void> => {
      writeFileSync(file, '')
      await until(() => run.child.exitCode !== null, 'the end of tent start', 30_000)
    }
    return { run, end }
  }
  // Each start is a program of its own on data that was opened before, and is ended once it has answered.
  const start = await measure(
    'start.first',
    async () => {
      const before = performance.now()
      const { end } = started()
      await soon(() => answered(engineOf(data).port), 'the first answered request', 60_000)
      const took = performance.now() - before
      await end()
      return took
    },
    { warm: true },
  ).catch((missed: unknown) => missed)
  const idle = started()
  await soon(() => answered(engineOf(data).port), 'the first answered request', 60_000)
  const memory = await measure(
    'memory.idle',
    async () => {
      // The app does nothing for a moment before each reading.
      await new Promise((done) => setTimeout(done, 1000))
      return memoryOf(Number(engineOf(data).pid))
    },
    { unit: 'bytes' },
  ).catch((missed: unknown) => missed)
  await idle.end()
  // Both are measured before either is held, so that one missed bar leaves the other measure written.
  for (const measured of [start, memory]) if (measured instanceof Error) throw measured
  assert.equal(Number(start) > 0 && Number(memory) > 0, true)
})

test('[29-2] [21-6] tent start of an install, as it ships, of an app with no link and no mail, loads nothing of the borrowed WebSocket part and nothing of the mail part, as the sources load neither', async (t) => {
  const rel = await released('1.0.0')
  const folder = outsideFolderOf(t, 'shipped-loads')
  const person = personIn(folder, { npm: false })
  laidInstall(rel, person.tent, ['runtime', 'player'])
  const built = await buildProject(shopIn(folder), { for: 'release' })
  const data = join(folder, 'data')
  const loaded = join(folder, 'loaded.txt')
  const version = join(person.tent, 'versions', rel.version)
  const runtime = join(version, 'runtime', ...(process.platform === 'win32' ? ['node.exe'] : ['bin', 'node']))
  // The runtime of the install is started as its launcher starts it, with the hook that writes what it loads.
  const run = startedIn(
    t,
    runtime,
    [
      `--import=${new URL('./loadedHook.ts', import.meta.url).href}`,
      join(version, 'player', 'tent.mjs'),
      ...startWords(['start', built.bundleFolder, '--data', data, '--port', '0']),
    ],
    { cwd: folder, env: { ...person.env, TENT_LOADED: loaded } },
  )
  const answered = async (): Promise<boolean> => {
    const at = engineOf(data).port
    if (at === undefined) return false
    try {
      return (await fetch(`http://127.0.0.1:${at}/_t/health`)).status === 200
    } catch {
      return false
    }
  }
  await until(answered, 'the first answered request', 60_000)
  const all = readFileSync(loaded, 'utf8').split(/\r?\n/)
  assert.ok(
    all.some((address) => address.includes('/player/parts/engine/')),
    `the hook saw the engine load: ${run.said()}`,
  )
  assert.deepEqual(
    all
      .filter((address) => /\/node_modules\/(ws|nodemailer)\//.test(address))
      .map((address) => address.split('/node_modules/')[1]),
    [],
  )
})

test('[41-1] tent start of an install, as it ships, runs an app whose server modules share a file: each loads the module of what they share', async (t) => {
  const rel = await released('1.0.0')
  const folder = outsideFolderOf(t, 'shipped-shared')
  const person = personIn(folder, { npm: false })
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player'])
  // Two functions, each in a file of its own, read one helper: the build writes the helper as a module both import.
  const helper = "export const greeting = (name: string): string => ['Hello, ', name, '.'].join('')\n"
  const caller = (name: string) =>
    `import { action, anyone, text } from 'tentjs'\nimport { greeting } from '../lib/greeting.ts'\n\nexport const ${name} = action('${name}', {\n  access: anyone('anyone may be greeted'),\n  input: { name: text() },\n  output: text(),\n  run: async ({ input }) => greeting(input.name),\n})\n`
  const project = shopIn(folder, {
    files: {
      'lib/greeting.ts': helper,
      'functions/hello.ts': caller('hello'),
      'functions/welcome.ts': caller('welcome'),
    },
  })
  const built = await buildProject(project, { for: 'release' })
  const server = readdirSync(join(built.bundleFolder, 'server'))
  assert.ok(
    server.some((file) => file.startsWith('shared.')),
    `the build wrote what the functions share as a module of its own: ${server.join(', ')}`,
  )
  const data = join(folder, 'data')
  const run = startedIn(t, launcher, startWords(['start', built.bundleFolder, '--data', data, '--port', '0']), {
    cwd: folder,
    env: person.env,
  })
  await until(async () => engineOf(data).port !== undefined || run.child.exitCode !== null, 'the engine', 60_000)
  assert.equal(run.child.exitCode, null, `tent start runs: ${run.said()}`)
  const asked = await fetch(`http://127.0.0.1:${engineOf(data).port}/_t/call/welcome`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: { name: 'Maya' } }),
  })
  const answer: unknown = await asked.json()
  assert.equal(Reflect.get(Object(answer), 'value'), 'Hello, Maya.', `${JSON.stringify(answer)} ${run.said()}`)
})

test('[41-1] the player of a release holds the code of each part as one file, and no file of code of a part by itself', async (t) => {
  const rel = await released('1.0.0')
  const person = personIn(outsideFolderOf(t, 'shipped-files'), { npm: false })
  laidInstall(rel, person.tent, ['runtime', 'player'])
  const parts = join(person.tent, 'versions', rel.version, 'player', 'parts')
  for (const part of ['core', 'data', 'engine', 'cli'])
    assert.ok(existsSync(join(parts, part, 'part', 'code.js')), part)
  // The files of code that the source holds beside its entries are inside that one file now.
  for (const file of [
    'engine/versions.js',
    'engine/opening/started.js',
    'cli/install/updateInstall.js',
    'core/describe.js',
  ])
    assert.equal(existsSync(join(parts, ...file.split('/'))), false, file)
})

test('[41-1] tent --version and tent -v of an install print the version of the release that runs, in one line, and end with 0, also where the install holds the player alone', async (t) => {
  const rel = await released('1.0.0')
  const person = personIn(outsideFolderOf(t, 'shipped-version'), { npm: false })
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player'])
  for (const word of ['--version', '-v']) {
    const said = await ran(launcher, [word], { cwd: person.home, env: person.env })
    assert.equal(said.status, 0, `${said.out}${said.err}`)
    assert.equal(said.out.trim(), rel.version)
    const json = await ran(launcher, [word, '--json'], { cwd: person.home, env: person.env })
    assert.deepEqual(JSON.parse(json.out), { ok: true, value: rel.version, findings: [] })
  }
})

test('[41-1] the player and the build tools of a release hold no paper of how the framework was built: no text of an interface, no list of what is owed a page, no notes of the pages a part was built against', async (t) => {
  const rel = await released('1.0.0')
  const person = personIn(outsideFolderOf(t, 'shipped-papers'), { npm: false })
  laidInstall(rel, person.tent, ['runtime', 'player', 'tools'])
  const version = join(person.tent, 'versions', rel.version)
  const papers = ['interface.txt', 'owed.json', 'sources.md']
  const found = readdirSync(version, { recursive: true, encoding: 'utf8' }).filter(
    (path) => !path.includes('node_modules') && papers.some((one) => basename(path) === one),
  )
  assert.deepEqual(found, [])
  // What the parts read at run time beside their code is still there.
  for (const file of [
    'tools/parts/docs/AGENTS.md',
    'tools/parts/docs/reference.txt',
    'player/parts/engine/fetched.json',
  ])
    assert.ok(existsSync(join(version, ...file.split('/'))), file)
})

test('[41-1] a direct install with the build tools builds a project with a screen: what the build needs, React among it, is found in the tools layer', async (t) => {
  const rel = await released('1.0.0')
  const folder = outsideFolderOf(t, 'shipped-build')
  const person = personIn(folder, { npm: false })
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player', 'tools'])
  const project = join(folder, 'plain')
  cpSync(join(import.meta.dirname, '..', '..', 'test', 'tests', 'plain'), project, { recursive: true })
  const made = await ran(launcher, ['build', '--json'], { cwd: project, env: person.env })
  assert.equal(made.status, 0, `${made.out}${made.err}`)
  const bundle = String(JSON.parse(made.out).value.bundle)
  const browser = Object(JSON.parse(readFileSync(join(bundle, 'description.json'), 'utf8')).browser)
  // The bundle carries its page code and the module of its screen.
  for (const file of [browser.page.main, browser.screens.homeScreen[0]]) assert.ok(existsSync(join(bundle, file)), file)
})

test('[31-12] tent dev of an install, as it ships, from the command to a usable page, is within its budget', async (t) => {
  const rel = await released('1.0.0')
  const folder = outsideFolderOf(t, 'shipped-dev')
  const person = personIn(folder, { npm: false })
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player', 'tools'])
  const project = join(folder, 'devs')
  cpSync(join(import.meta.dirname, 'devs'), project, { recursive: true })
  // Each start is told to end as Ctrl+C ends it, so the runtime writes its cache of compiled code as it does for a
  // person: a program that is ended by force writes none, and every start would compile the code anew.
  const ending = new URL('./endedByFile.ts', import.meta.url).href
  let starts = 0
  // The first start makes the page code and the modules of the project and keeps them: it is not counted.
  const middle = await measure(
    'dev.page',
    async () => {
      const end = join(folder, `end-${++starts}`)
      const env = { ...person.env, NODE_OPTIONS: `--import=${ending}`, TENT_TEST_END: end }
      const began = performance.now()
      const dev = startedIn(t, launcher, ['dev', '--port', '0'], { cwd: project, env })
      // The line is taken as it arrives: a wait that asks again and again adds its own pauses to the measure.
      const listens = /localhost:(\d+) \(/
      await new Promise<void>((done) => {
        const look = (): void => {
          if (listens.test(dev.said())) done()
        }
        dev.child.stdout?.on('data', look)
        dev.child.stderr?.on('data', look)
        dev.child.once('exit', () => done())
        look()
      })
      const port = Number(listens.exec(dev.said())?.[1])
      assert.ok(port > 0, `tent dev said: ${dev.said()}`)
      const page = await fetch(`http://localhost:${port}/`)
      assert.equal(page.status, 200)
      assert.match(await page.text(), /The first heading/)
      const took = performance.now() - began
      // Each start is a program of its own, which has ended before the next one starts on the same data.
      writeFileSync(end, '')
      await until(() => dev.child.exitCode !== null, 'the end of tent dev', 30_000)
      return took
    },
    { unit: 'ms', warm: true },
  )
  assert.ok(middle > 0)
})
