import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The folder of the app, and the command line of the copy of Tent.js it lies in. */
export const folder = fileURLToPath(new URL('..', import.meta.url))
const shell = join(folder, '..', '..', 'parts', 'cli', 'shell.ts')

type Answer = { ok: boolean; value: unknown; findings: unknown[] }

/** Runs `tent <words> --json` in the folder of the app, and answers its `value`; a command that fails throws. */
export function tent(words: string[]): Promise<unknown> {
  return new Promise((done, failed) => {
    execFile(
      process.execPath,
      [shell, ...words, '--json'],
      { cwd: folder, maxBuffer: 64 * 1024 * 1024 },
      (error, out, err) => {
        let answer: Answer | undefined
        try {
          answer = JSON.parse(out)
        } catch {
          answer = undefined
        }
        if (!answer?.ok) failed(new Error(`tent ${words.join(' ')} failed: ${error?.message ?? ''}\n${out}\n${err}`))
        else done(answer.value)
      },
    )
  })
}

/** Builds the app, and answers the folder of its bundle. */
export async function build(): Promise<string> {
  const built = await tent(['build'])
  if (!built || typeof built !== 'object' || !('bundle' in built) || typeof built.bundle !== 'string')
    throw new Error('tent build answered no bundle')
  return built.bundle
}

export type Running = { origin: string; data: string; stop: () => void }

/** Starts the bundle with `tent start --mode test --seed` on an empty data folder, and answers once it runs. */
export function start(bundle: string): Promise<Running> {
  const data = mkdtempSync(join(tmpdir(), 'marketing-site-walk-'))
  const child: ChildProcess = spawn(
    process.execPath,
    [shell, 'start', bundle, '--data', data, '--port', '0', '--mode', 'test', '--seed'],
    { cwd: folder, stdio: ['ignore', 'ignore', 'pipe'] },
  )
  return new Promise((done, failed) => {
    let said = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      said += chunk.toString()
      const runs = /runs at (http:\/\/[^\s]+)/.exec(said)
      // One address for every request of the walk: `localhost` may be reached by two, which the engine counts apart.
      if (runs) done({ origin: runs[1].replace('//localhost:', '//127.0.0.1:'), data, stop: () => child.kill() })
    })
    child.on('exit', (code) => failed(new Error(`tent start ended with ${code}: ${said}`)))
  })
}

/** The rows of a table of the running app, read with `tent data rows`. */
export async function rows(table: string, data: string): Promise<Record<string, unknown>[]> {
  const answer = await tent(['data', 'rows', table, '--data', data])
  if (!Array.isArray(answer)) throw new Error(`tent data rows ${table} answered no list`)
  return answer
}
