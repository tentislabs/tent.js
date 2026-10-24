import { spawn } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import type { Box, Ran, Sandbox } from '../../engine/index.ts'
import { closing } from './held.ts'

// The program of the command line, which a box of these tests runs as `tent`.
const shell = join(import.meta.dirname, '..', '..', 'cli', 'shell.ts')

/** The words of a command as a box reads them: a word in double quotes may hold spaces. */
const wordsOf = (command: string): string[] =>
  [...command.matchAll(/"([^"]*)"|(\S+)/g)].map((one) => one[1] ?? one[2] ?? '')

/** What a box of these tests was handed and did, for a test to read. */
export interface TestSandbox extends Sandbox {
  // What each `start` was handed, in order.
  started: { id: string; owner: string; folder: string; work: string }[]
  // Each command that `run` was handed, as it was handed it.
  commands: string[]
  // The id of each box that was stopped, in order.
  stopped: string[]
}

/**
 * A `Sandbox` of these tests: each box is a folder of the test, where the project is shown as it stands at each
 * command, by a copy that the commands may write into while the project itself stays as it was. It is no wall: it
 * shows what crosses the wall, and holds the engine to what it owes a box.
 */
export function testSandbox(t: TestContext): TestSandbox {
  mkdirSync(join(process.cwd(), 'results', 'workspaces'), { recursive: true })
  const views = mkdtempSync(join(process.cwd(), 'results', 'workspaces', 'boxes-'))
  const boxes = new Map<string, { box: Box; project: string }>()
  /** Shows the project as it stands now, in the folder that the box reads it from. */
  const shown = (id: string): void => {
    const held = boxes.get(id)
    if (!held) throw new Error(`no box ${id} was started`)
    rmSync(held.box.folder, { recursive: true, force: true })
    cpSync(held.project, held.box.folder, { recursive: true })
  }
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const sandbox: TestSandbox = {
    started: [],
    commands: [],
    stopped: [],
    async start(o) {
      sandbox.started.push({ ...o })
      const standing = boxes.get(o.id)
      if (standing) return standing.box
      const view = join(views, o.id)
      mkdirSync(view, { recursive: true })
      mkdirSync(o.work, { recursive: true })
      const box = { id: o.id, folder: view, work: o.work }
      boxes.set(o.id, { box, project: o.folder })
      return box
    },
    async run(box, command, o) {
      sandbox.commands.push(command)
      shown(box.id)
      const [tent, ...words] = wordsOf(command)
      if (tent !== 'tent') throw new Error(`a box runs the command tent alone, and was handed ${command}`)
      const child = spawn(process.execPath, [shell, ...words], { cwd: box.folder, env, signal: o?.signal })
      const [out, err]: string[][] = [[], []]
      child.stdout.on('data', (part) => void out.push(String(part)))
      child.stderr.on('data', (part) => void err.push(String(part)))
      const code = await new Promise<number>((done) => child.on('close', (ended) => done(ended ?? 1)))
      const ran: Ran = { code, out: out.join(''), err: err.join('') }
      return ran
    },
    async stop(box) {
      sandbox.stopped.push(box.id)
    },
  }
  closing(t, async () => {
    for (const { box } of boxes.values()) await sandbox.stop(box)
    rmSync(views, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  return sandbox
}
