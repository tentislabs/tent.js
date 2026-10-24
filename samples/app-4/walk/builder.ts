// What the walk needs around the program of the product: its bundle, its secrets, a free port, and the data
// of a workspace read as its test side holds it.
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { type Builder, startBuilder } from '../server.ts'
import { fakeWriter } from './writer.ts'

const run = promisify(execFile)

export const APP_FOLDER = fileURLToPath(new URL('../', import.meta.url))
export const PRODUCT = join(APP_FOLDER, 'product')

// In this repository the command `tent` is this file, run by the pinned runtime.
export const TENT = [process.execPath, fileURLToPath(new URL('../../../parts/cli/shell.ts', import.meta.url))]

type Answer = { ok: boolean; value: unknown }

function isAnswer(value: unknown): value is Answer {
  return typeof value === 'object' && value !== null && 'ok' in value && 'value' in value
}

/** Carries out `tent <words> --json` in the folder of a project, the product where none is named, and answers its value. */
export async function tent(words: string[], input?: string, folder = PRODUCT): Promise<unknown> {
  const [program, ...first] = TENT
  const child = run(program ?? '', [...first, ...words, '--json'], { cwd: folder })
  if (input !== undefined) {
    child.child.stdin?.end(input)
  }
  const said = await child.catch((error: { stdout?: string; message: string }) => ({
    stdout: error.stdout || error.message,
  }))
  const answer: unknown = said.stdout.trim().startsWith('{') ? JSON.parse(said.stdout) : undefined
  if (!isAnswer(answer) || !answer.ok) throw new Error(`tent ${words.join(' ')} failed: ${said.stdout}`)
  return answer.value
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

export type Walked = Builder & { writer: ReturnType<typeof fakeWriter>; folder: string; remove: () => Promise<void> }

/** Builds the product, and starts its program in the mode `test` on an empty data folder, with the seed applied. */
export async function startWalk(): Promise<Walked> {
  const folder = await mkdtemp(join(tmpdir(), 'tent-sample-app-4-'))
  const built = await tent(['build', '--out', join(folder, 'bundle')])
  const bundle = typeof built === 'object' && built !== null && 'bundle' in built ? String(built.bundle) : ''
  // The model is faked, so its key is a word that opens nothing.
  await tent(['secrets', 'set', 'ANTHROPIC_KEY', '--data', join(folder, 'data')], 'not-a-key')
  const writer = fakeWriter()
  const builder = await startBuilder({
    bundle,
    folder,
    port: await freePort(),
    mode: 'test',
    makers: { providers: () => ({ anthropic: writer }) },
    tent: TENT,
  })
  await builder.app.seed()
  return {
    ...builder,
    writer,
    folder,
    remove: () => rm(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }),
  }
}

/** The text of a file of the project of a workspace. */
export function fileOf(walked: Walked, workspace: string, path: string): Promise<string> {
  return readFile(join(walked.folder, 'workspaces', workspace, 'project', path), 'utf8')
}
