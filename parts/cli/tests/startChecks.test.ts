import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { keptAlone } from '../../engine/index.ts'
import { shopIn } from './bundledShop.ts'
import { laidInstall, outsideFolderOf, personIn, ran, released, startedIn, until } from './released.ts'
import { startWords } from './startWords.ts'

// The checks that a start on Windows asks of the system's own programs, held on an install as it ships: its
// runtime runs the player with a hook that writes what the program loads and runs, in order.

/** One record of the hook: a module that was loaded, or a program of the system that was run, held or answered. */
interface Told {
  at: number
  kind: 'load' | 'ran' | 'held' | 'answered'
  url?: string
  program?: string
  sync?: boolean
  args?: string[]
  beside?: string[]
}

/** A start of the shop as it ships, on a data folder that is not there yet, run by the runtime of the install. */
async function shippedStart(t: TestContext, name: string) {
  const rel = await released('1.0.0')
  const folder = outsideFolderOf(t, name)
  const person = personIn(folder, { npm: false })
  laidInstall(rel, person.tent, ['runtime', 'player'])
  const built = await buildProject(shopIn(folder), { for: 'release' })
  const version = join(person.tent, 'versions', rel.version)
  const runtime = join(version, 'runtime', ...(process.platform === 'win32' ? ['node.exe'] : ['bin', 'node']))
  const toldIn = join(folder, 'told.jsonl')
  const data = join(folder, 'data')
  return {
    folder,
    data,
    runtime,
    env: { ...person.env, TENT_TOLD: toldIn },
    /** The words of the runtime for the words of `tent`: the hook first, as the launcher starts the player. */
    played: (typed: string[]): string[] => [
      `--import=${new URL('./askedHook.ts', import.meta.url).href}`,
      join(version, 'player', 'tent.mjs'),
      ...typed,
    ],
    start: startWords(['start', built.bundleFolder, '--data', data, '--port', '0']),
    plainStart: ['start', built.bundleFolder, '--data', data, '--port', '0'],
    told: (): Told[] =>
      existsSync(toldIn)
        ? readFileSync(toldIn, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        : [],
  }
}

/** What `engine.json` of a data folder says, or nothing while it says nothing. */
function engineOf(data: string): { port?: number; token?: string } {
  try {
    return JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8'))
  } catch {
    return {}
  }
}

/** Whether the engine of a data folder answers whether it is ready, where its `engine.json` says it listens. */
async function answers(data: string): Promise<boolean> {
  const { port } = engineOf(data)
  if (port === undefined) return false
  try {
    return (await fetch(`http://127.0.0.1:${port}/_t/health`)).status === 200
  } catch {
    return false
  }
}

const ranOf = (told: Told[], program: string): Told[] =>
  told.filter((one) => one.kind === 'ran' && one.program === program)

test('[41-14] on Windows the program that tells the account is started before the parts are loaded, beside their loading, and answered before anything of the app is opened', async (t) => {
  if (process.platform !== 'win32') return
  const s = await shippedStart(t, 'start-account')
  const answer = join(s.folder, 'answer')
  const run = startedIn(t, s.runtime, s.played(s.start), {
    cwd: s.folder,
    env: { ...s.env, TENT_HOLD: 'whoami.exe', TENT_HOLD_UNTIL: answer },
  })
  const engineLoaded = (told: Told[]): boolean =>
    told.some((one) => one.kind === 'load' && one.url?.includes('/player/parts/engine/') === true)
  await until(
    () => engineLoaded(s.told()) && ranOf(s.told(), 'whoami.exe').length > 0,
    'the engine loaded and the account asked',
    60_000,
  )
  const told = s.told()
  const asked = told.findIndex((one) => one.kind === 'ran' && one.program === 'whoami.exe')
  // The asking needs the code of `core`, which holds it: every other part, and the code of the command line, load after.
  const parts = told.findIndex(
    (one) => one.kind === 'load' && /\/player\/parts\/(?!core\/|cli\/askFirst\.js$)/.test(one.url ?? ''),
  )
  assert.ok(asked >= 0 && asked < parts, `the account was asked before the parts were loaded: ${JSON.stringify(told)}`)
  assert.equal(told[asked].sync, false, 'the program that tells the account runs beside the loading')
  // While its answer is held, the start opens nothing of the app, however long it waits.
  await new Promise((done) => setTimeout(done, 500))
  assert.equal(existsSync(s.data), false, `nothing of the app is opened before the account is told: ${run.said()}`)
  writeFileSync(answer, '')
  await until(() => answers(s.data), 'the first answered request', 60_000)
  // One start asks the system once, and keeps nothing of its answer for the next.
  assert.equal(ranOf(s.told(), 'whoami.exe').length, 1, JSON.stringify(ranOf(s.told(), 'whoami.exe')))
})

test('[41-14] on Windows a raised start is refused as before, on the account that was asked as it began, and nothing of the app is opened', async (t) => {
  if (process.platform !== 'win32') return
  const s = await shippedStart(t, 'start-raised')
  const refused = await ran(s.runtime, s.played(s.plainStart), { cwd: s.folder, env: { ...s.env, TENT_RAISED: 'yes' } })
  assert.equal(refused.status, 1, `${refused.out}${refused.err}`)
  assert.match(refused.out, /--as-root/)
  assert.equal(existsSync(s.data), false)
  assert.deepEqual(
    ranOf(s.told(), 'whoami.exe').map((one) => one.sync),
    [false],
    'the refusal stands on the one answer that was asked beside the loading',
  )
})

test('[41-14] on Windows engine.json holds its token only once its rights are the current user alone: the program that closes it runs beside the opening of the app', async (t) => {
  if (process.platform !== 'win32') return
  const s = await shippedStart(t, 'start-engine-file')
  const answer = join(s.folder, 'answer')
  const run = startedIn(t, s.runtime, s.played(s.start), {
    cwd: s.folder,
    env: { ...s.env, TENT_HOLD: 'icacls.exe', TENT_HOLD_UNTIL: answer },
  })
  // The engine closes other files of the data folder too, as the key of its secrets: this is the closing of its file.
  const closing = (): Told | undefined =>
    ranOf(s.told(), 'icacls.exe').find((one) => {
      const path = one.args?.[0]
      return path !== undefined && dirname(path) === s.data && basename(path).startsWith('engine.json')
    })
  // The opening goes on while the rights are closed: the data of the app is opened after the closing was begun.
  await until(
    () => closing() !== undefined && existsSync(join(s.data, 'data.db')),
    'the data opened while engine.json is closed',
    60_000,
  )
  assert.equal(closing()?.sync, false, 'the rights are closed beside the opening')
  assert.equal(closing()?.beside?.includes('data.db'), false, 'the closing is begun before the data is opened')
  // However long the closing takes, the file says nothing of the engine before it has ended.
  await new Promise((done) => setTimeout(done, 500))
  assert.equal(engineOf(s.data).token, undefined, `engine.json holds no token while it is closed: ${run.said()}`)
  writeFileSync(answer, '')
  await until(() => answers(s.data), 'the first answered request', 60_000)
  assert.equal(keptAlone(join(s.data, 'engine.json')).why, undefined)
})
