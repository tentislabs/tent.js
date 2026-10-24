import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { after, before } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Caller } from '../../core/index.ts'
import type { App, Engine } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import type { PackageFile, StandIn } from './pythonStandIn.ts'
import { pythonStandIn, testPackages, wheelOf } from './pythonStandIn.ts'
import { root, typed } from './typed.ts'

/** A package of numbers, as a package of the kind that `numpy` is gives them: each with its plain form, and none of its own kind. */
export const numberish: PackageFile = wheelOf('numberish', '1.0', 'py3-none-any', {
  'numberish/__init__.py':
    'class Scalar:\n    def __init__(self, v):\n        self.v = v\n\n    def item(self):\n        return self.v\n\n\n' +
    'class Array:\n    def __init__(self, items):\n        self.items = list(items)\n\n    def tolist(self):\n        return list(self.items)\n',
})

/** What the tests of one file share: the stand-in, a runner's folder, and the project of the calls with its lock and its bundle. */
export interface Shared {
  stand: StandIn
  home: string
  project: string
  bundle: string
}

/**
 * Lays down, for the tests of one file, a stand-in of the parts and of the package index, a runner's folder of the
 * file's own, and a copy of a project beside these tests under `results/`, the project of the calls where none is
 * named, locked and built, before its first test.
 * Answers what it laid, which a test reads once it runs. Everything is taken away when the file has run.
 */
export function sharedPython(name: string, of = 'pythonCalls'): Shared {
  const laid: Partial<Shared> = {}
  const folder = join(root, 'results', 'cli', `python-${name}`)
  const stood: Record<string, string | undefined> = {}
  // What the file closes once it has run: a hook of a hook would close it as soon as the first hook ended.
  const closing: (() => Promise<void>)[] = []
  before(async () => {
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
    mkdirSync(folder, { recursive: true })
    laid.stand = await pythonStandIn({ after: (fn: () => Promise<void>) => void closing.push(fn) }, [
      ...testPackages(),
      numberish,
    ])
    laid.home = mkdtempSync(join(folder, 'home-'))
    for (const [key, value] of Object.entries({ TENT_HOME: laid.home, TENT_PARTS: laid.stand.parts })) {
      stood[key] = process.env[key]
      process.env[key] = value
    }
    laid.project = join(folder, of)
    cpSync(join(import.meta.dirname, of), laid.project, { recursive: true })
    const locked = await typed(laid.project, 'python', 'lock', '--json')
    assert.equal(locked.ended, 0, locked.printed)
    const built = await buildProject(laid.project, { for: 'dev' })
    assert.deepEqual(
      built.findings.filter((one) => one.level === 'error'),
      [],
    )
    laid.bundle = built.bundleFolder
  })
  after(async () => {
    for (const one of closing) await one()
    for (const [key, value] of Object.entries(stood))
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  const read = <Key extends keyof Shared>(key: Key): Shared[Key] => {
    const value = laid[key]
    assert.ok(value !== undefined, `the shared ${key} is laid before a test reads it`)
    return value
  }
  return {
    get stand() {
      return read('stand')
    },
    get home() {
      return read('home')
    },
    get project() {
      return read('project')
    },
    get bundle() {
      return read('bundle')
    },
  }
}

/** An app of the project of the calls, opened in an engine of the test's own on a data folder of its own. */
export interface Opened {
  app: App
  // The engine the app was opened in, which answers what its program used.
  engine: Engine
  dataFolder: string
  // A user of the app, with the roles it is handed.
  user(roles?: string[]): Promise<Caller>
}

/**
 * Opens the bundle that the tests share in an engine of the test's own, on a new data folder, in the mode
 * `development`. The engine is closed, with every Python program of it, when the test ends.
 */
export async function opened(t: TestContext, shared: Shared, bundle = shared.bundle): Promise<Opened> {
  const dataFolder = mkdtempSync(join(shared.home, '..', 'data-'))
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const app = await engine.open(bundle, { dataFolder, mode: 'development' })
  let n = 0
  return {
    app,
    engine,
    dataFolder,
    user: async (roles = []) => {
      n += 1
      const row: unknown = await app.write([{ add: 'users', values: { name: `user ${n}`, roles } }], { as: 'system' })
      const id = String(Reflect.get(Object(Array.isArray(row) ? row[0] : row), 'id'))
      return { kind: 'user', user: { id, roles } }
    },
  }
}

/** The rows of a table of the log of a data folder, in the order they were written. */
export function logOf(dataFolder: string, table: string): Record<string, unknown>[] {
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    return log.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()
  } finally {
    log.close()
  }
}

/** Whether a program of this computer is running, by its number. */
export function running(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Waits until a test holds, for as long as `within` milliseconds. Fails with the words where it never does. */
export async function untilWithin(
  test: () => boolean | Promise<boolean>,
  words: string,
  within = 20_000,
): Promise<void> {
  const ends = performance.now() + within
  while (!(await test())) {
    if (performance.now() > ends) assert.fail(`never: ${words}`)
    await new Promise((done) => setTimeout(done, 50))
  }
}
