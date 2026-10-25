import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, rm, symlink, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const APP_FOLDER = fileURLToPath(new URL('../', import.meta.url))

// In this repository the command `tent` is this file, run by the pinned runtime.
const SHELL = fileURLToPath(new URL('../../../parts/cli/shell.ts', import.meta.url))

export type RunningApp = {
  folder: string
  address: string
  dataFolder: string
  stop: () => Promise<void>
}

type Answer = { ok: boolean; value: unknown }

function isAnswer(value: unknown): value is Answer {
  return typeof value === 'object' && value !== null && 'ok' in value && 'value' in value
}

/** Carries out `tent <words> --json` in the folder of a project, and answers its value. */
export async function tent(folder: string, words: string[]): Promise<unknown> {
  const said = await run(process.execPath, [SHELL, ...words, '--json'], { cwd: folder }).catch(
    (error: { stdout?: string; message: string }) => ({ stdout: error.stdout || error.message }),
  )
  const answer: unknown = said.stdout.trim().startsWith('{') ? JSON.parse(said.stdout) : undefined
  if (!isAnswer(answer) || !answer.ok) throw new Error(`tent ${words.join(' ')} failed: ${said.stdout}`)
  return answer.value
}

/** Reads the text that an answer holds under a name. */
export function textOf(value: unknown, name: string): string {
  if (typeof value === 'object' && value !== null && name in value) {
    const member = Object.entries(value).find(([key]) => key === name)?.[1]
    if (typeof member === 'string') return member
  }
  throw new Error(`The answer holds no text under "${name}": ${JSON.stringify(value)}`)
}

/** A new empty folder outside the repository, and what takes it away again. */
export async function tempFolder(): Promise<{ path: string; remove: () => Promise<void> }> {
  const path = await mkdtemp(join(tmpdir(), 'tent-orders-'))
  return { path, remove: () => rm(path, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }) }
}

/** Installs the packages of the project from its lock file where they are not there yet, as a fresh copy needs. */
export async function ensurePackages(): Promise<void> {
  if (existsSync(join(APP_FOLDER, 'node_modules'))) return
  // The npm that the runtime came with lies beside it on Windows, and under `lib/` elsewhere.
  const npm = [
    join(dirname(process.execPath), 'node_modules'),
    join(dirname(process.execPath), '..', 'lib', 'node_modules'),
  ]
    .map((folder) => join(folder, 'npm', 'bin', 'npm-cli.js'))
    .find((path) => existsSync(path))
  if (!npm) throw new Error('No npm lies beside the runtime, to install the packages of the app.')
  await run(process.execPath, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: APP_FOLDER })
}

/** Builds the project of a folder into `out`, and answers the folder of its bundle. */
export async function buildApp(folder: string, out: string): Promise<string> {
  return textOf(await tent(folder, ['build', '--out', out]), 'bundle')
}

/** Starts a bundle with `tent start --mode test --seed` on a data folder, on a free port. */
export async function startApp(folder: string, bundle: string, dataFolder: string): Promise<RunningApp> {
  await mkdir(dataFolder, { recursive: true })
  const child = spawn(
    process.execPath,
    [SHELL, 'start', bundle, '--mode', 'test', '--seed', '--port', '0', '--data', dataFolder],
    { cwd: folder, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  try {
    return { folder, address: await saidAddress(child), dataFolder, stop: () => ended(child) }
  } catch (error) {
    await ended(child)
    throw error
  }
}

/** A copy of the project in `folder`, with its packages linked in, so a walk may save its files. */
export async function copyApp(folder: string): Promise<string> {
  const left = [join(APP_FOLDER, 'node_modules'), join(APP_FOLDER, '.tent'), join(APP_FOLDER, 'walk')]
  await cp(APP_FOLDER, folder, { recursive: true, filter: (from) => !left.some((one) => from.startsWith(one)) })
  await symlink(join(APP_FOLDER, 'node_modules'), join(folder, 'node_modules'), 'junction')
  return folder
}

/** Takes the link to the packages out of a copy, so that removing the copy leaves the packages alone. */
export async function unlinkApp(folder: string): Promise<void> {
  await unlink(join(folder, 'node_modules')).catch(() => undefined)
}

/** Runs `tent dev` in the folder of a project, on its own development data, on a free port. */
export async function devApp(folder: string): Promise<RunningApp> {
  const child = spawn(process.execPath, [SHELL, 'dev', '--port', '0'], {
    cwd: folder,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.resume()
  try {
    const address = await saidAddress(child)
    return { folder, address, dataFolder: join(folder, '.tent'), stop: () => ended(child) }
  } catch (error) {
    await ended(child)
    throw error
  }
}

// `tent start` and `tent dev` say on the standard error where the app runs, and on the standard output what stopped them.
function saidAddress(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let said = ''
    const timer = setTimeout(() => reject(new Error(`The app did not start in 120 seconds: ${said}`)), 120_000)
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (piece: string) => {
      said += piece
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (piece: string) => {
      said += piece
      const found = /runs at (http:\/\/localhost:\d+)/.exec(said)
      if (found?.[1]) {
        clearTimeout(timer)
        resolve(found[1])
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`tent start ended with ${code}: ${said}`))
    })
  })
}

function ended(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve()
    child.once('exit', () => resolve())
    child.kill()
  })
}

/** The rows of a table of a running app, as `tent data rows` answers them. */
export async function rowsOf(app: RunningApp, table: string): Promise<unknown[]> {
  const rows = await tent(app.folder, ['data', 'rows', table, '--data', app.dataFolder])
  if (!Array.isArray(rows)) throw new Error(`\`tent data rows ${table}\` answered no list.`)
  return rows
}
