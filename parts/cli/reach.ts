import { join, resolve } from 'node:path'
import type { Finding } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { finding, programRuns } from '../core/internal.ts'
import type { App } from '../engine/index.ts'
import { createEngine, engineFileOf, ownEngineFile, provedAt } from '../engine/index.ts'
import { guardOf } from './guarded.ts'

/** What a command of the admin channel answered: its value, or what the engine refused it with, as a finding. */
export interface Asked {
  value?: unknown
  findings?: Finding[]
}

/** Where an engine that runs is reached: its port and its admin token, the mode it runs in, and its program. */
export interface Running {
  port: number
  token: string
  mode?: string
  pid?: number
}

/**
 * Takes a data folder. Answers where the engine that runs on it is reached, or nothing where none runs.
 * `engine.json` is read only when it is an ordinary file that the current user owns: a link in its place, or a
 * file of another user, is no engine. A file whose program runs no more was left behind. And the number of a
 * program may have been given to another since: what listens proves that it holds the token before it is taken
 * for the engine. For anything else the token is sent nowhere. Throws where a folder lies in the place of the file,
 * and T0006 where the engine runs behind a proxy named by an address of this computer, which takes no command.
 */
export async function engineAt(dataFolder: string): Promise<Running | undefined> {
  const at = engineFileOf(dataFolder)
  if (!at || !programRuns(at.pid)) return undefined
  const proof = await provedAt(at.port, at.token)
  if (proof === 'refused')
    throw new TentError(
      'T0006',
      `The engine that runs on the data folder ${dataFolder}, in the program ${at.pid}, takes no command of this computer: the proxies it was named hold 127.0.0.1, the address a command of this computer comes from, so a command reaches it as a request through a proxy.`,
      {
        fix: 'Have the host in front reach the engine from another address of this computer, `127.0.0.2` (on macOS first add it with `sudo ifconfig lo0 alias 127.0.0.2`), and name that one in `--proxy from` in place of 127.0.0.1; or type the command while no engine runs on the data folder.',
      },
    )
  return proof === 'proved' ? at : undefined
}

/**
 * Takes a data folder that an engine of this program was opened on. Answers where it is reached, read as `engineAt`
 * reads the file: the program that wrote it is this one, so nothing else needs to prove it. Throws where it wrote none.
 */
export function ownEngine(dataFolder: string): Running {
  const at = ownEngineFile(dataFolder)
  if (!at) throw new Error(`The engine that this program opened on ${dataFolder} wrote no engine.json of its own.`)
  return at
}

/** What the engine answered a command, read from the wire form: the value, or the error as a finding. */
async function read(response: Response): Promise<Asked> {
  const body: Record<string, unknown> = Object(await response.json())
  if (body.ok === true) return { value: body.value }
  const error: Record<string, unknown> = Object(body.error)
  const fix = typeof error.fix === 'string' ? { fix: error.fix } : {}
  return { findings: [finding(String(error.code ?? 'T0009'), String(error.message ?? 'The engine failed.'), fix)] }
}

/** The data folder that a command works on: the one that `--data` named, or `.tent/` of the project. */
export const dataFolderOf = (o: { folder: string; data?: unknown }): string =>
  typeof o.data === 'string' ? resolve(o.folder, o.data) : join(o.folder, '.tent')

/** The request of a command to the admin channel of an engine. */
const request = (at: Running, command: string, args: object): Request =>
  new Request(`http://127.0.0.1:${at.port}/_t/admin/${command}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${at.token}` },
    body: JSON.stringify({ args }),
  })

/**
 * Takes an app that this program opened on a data folder, the name of a command of the admin channel, and its
 * words. Has the app carry the command out with no network, and answers what it answered.
 */
export async function askedOfOwn(app: App, dataFolder: string, command: string, args: object): Promise<Asked> {
  return read(await app.request(request(ownEngine(dataFolder), command, args)))
}

/**
 * Takes what `asked` takes. Has the engine that runs on the data folder carry the command out, and answers what it
 * answered. Where none runs it answers nothing, and starts none: it is for a command that must start no engine.
 * Where a folder lies in the place of `engine.json` it answers that as a finding.
 */
export async function askedOfRunning(
  o: { folder: string; data?: unknown },
  command: string,
  args: object,
): Promise<Asked | undefined> {
  let running: Running | undefined
  try {
    running = await engineAt(dataFolderOf(o))
  } catch (error) {
    // What lies in the place of the file lets no engine run there: the command says so, and ends.
    if (!(error instanceof TentError)) throw error
    return { findings: [finding(error.code, error.message, error.fix === undefined ? {} : { fix: error.fix })] }
  }
  return running ? read(await fetch(request(running, command, args))) : undefined
}

/** What a command for the machines of a running app answers where no engine runs on the data folder: it starts none. */
export const noneRuns = (command: string): Asked => ({
  findings: [
    finding('T0013', `No engine runs on the data folder: \`tent ${command}\` is for an app that runs.`, {
      fix: 'Start the app with `tent start`, and name its data folder with `--data`.',
    }),
  ],
})

/**
 * Takes the folder of a project and the data folder that `--data` named, if any, the name of a command of the
 * admin channel, and its words by their names. Has the engine that runs on the data folder carry the command out.
 * Where none runs, it builds the project and starts an engine for the length of the command, on the development
 * data, and closes it again. Answers the value of the command, or as findings what the build found or what the
 * engine refused the command with.
 */
export async function asked(o: { folder: string; data?: unknown }, command: string, args: object): Promise<Asked> {
  const dataFolder = dataFolderOf(o)
  const running = await askedOfRunning(o, command, args)
  if (running) return running
  // The build is loaded only where a command must build the project: `tent start` loads none of it.
  const { buildProject } = await import('../build/index.ts')
  const built = await buildProject(o.folder, { for: 'dev', ...guardOf(o.folder, dataFolder) })
  if (built.findings.some((one) => one.level === 'error')) return { findings: built.findings }
  const engine = createEngine({ port: 0 })
  try {
    const app: App = await engine.open(built.bundleFolder, { dataFolder, mode: 'development' })
    const own = ownEngine(dataFolder)
    // The engine is in this program: the command reaches it with no network, as a request of this computer.
    const answered = await read(await app.request(request(own, command, args)))
    return { ...answered, findings: [...built.findings, ...(answered.findings ?? [])] }
  } finally {
    await engine.close()
  }
}
