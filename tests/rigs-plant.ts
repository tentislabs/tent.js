import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import { system } from '../rig/system.ts'

/** The root of the repository. */
export const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Takes the number of a planted case and answers the folder of its tree, as the repository holds it.
 */
export const planted = (id: string): string => join(root, 'tests', 'planted', id)

/**
 * Copies the tree of a planted case to a folder of its own, with the fixed settings of the root beside it, and
 * leaves out each path of `without`. Takes the test, which removes the copy when it ends. Answers the folder.
 * The settings leave `tests/planted/` out, so the formatter, the linter and the type check hold a tree only in a copy.
 */
export function copyOf(t: TestContext, id: string, without: string[] = []): string {
  const copies = join(root, 'results', 'planted')
  mkdirSync(copies, { recursive: true })
  const folder = mkdtempSync(join(copies, `${id}-`))
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  cpSync(planted(id), folder, { recursive: true, filter: (from) => !from.endsWith('results') })
  for (const settings of ['biome.json', 'tsconfig.json']) cpSync(join(root, settings), join(folder, settings))
  for (const path of without) rmSync(join(folder, path), { recursive: true })
  return folder
}

/** What a program left behind: the number it ended with, and all it printed, with every path written with `/`. */
export type Ended = { code: number | null; out: string }

/**
 * Starts a program of the repository with the runtime, in `folder`, and waits for it. `program` is its path from the
 * root, and `words` are handed to it. Answers what it left behind. Throws when the program cannot be started.
 */
export function start(folder: string, program: string, ...words: string[]): Ended {
  const ended = spawnSync(process.execPath, [join(root, program), ...words], { cwd: folder, encoding: 'utf8' })
  if (ended.error) throw ended.error
  return { code: ended.status, out: `${ended.stdout}${ended.stderr}`.replaceAll('\\', '/') }
}

/** The programs of the rigs, each by its path from the root. */
export const programs = {
  comments: 'scripts/comments.mjs',
  borrowed: 'scripts/borrowed.mjs',
  tests: 'scripts/tests.mjs',
}

// A command of `package.json` names a borrowed program by the word that npm finds it by.
const borrowed: Record<string, string> = {
  biome: 'node_modules/@biomejs/biome/bin/biome',
  tsc: 'node_modules/typescript/bin/tsc',
}

/**
 * Carries out a command of the `package.json` of the root on the tree in `folder`, by the words that stand there,
 * one program after the other until one fails. A program of ours is handed the folder as its first word, and a
 * borrowed one is started in it. Answers what the last program that ran left behind, with all that was printed.
 * Throws on a word it cannot start.
 */
export function command(folder: string, name: string): Ended {
  const { scripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  let out = ''
  for (const step of String(scripts[name]).split(' && ')) {
    const [first, second, ...words] = step.split(' ')
    const program = borrowed[first]
    const ended = program
      ? start(folder, program, ...(second ? [second, ...words] : []))
      : first === 'node' && second
        ? start(root, second, folder, ...words)
        : undefined
    if (!ended) throw new Error(`the command ${name} holds a word that a test cannot start: ${step}`)
    out += ended.out
    if (ended.code !== 0) return { code: ended.code, out }
  }
  return { code: 0, out }
}

/**
 * Starts a run of the tests of the tree in `folder`, by day or with `night` by night, after it has removed the
 * result file of such a run there, so that what is read afterwards is what this run wrote. Answers what the run
 * left behind.
 */
export function run(folder: string, night = false): Ended {
  rmSync(resultFile(folder, night), { force: true })
  return start(root, programs.tests, folder, ...(night ? ['--night'] : []))
}

const resultFile = (folder: string, night: boolean) =>
  join(folder, 'results', `${system()}${night ? '.night' : ''}.json`)

/**
 * Reads the result file that a run of the tree in `folder` wrote, by day or with `night` by night. Throws when
 * there is none.
 */
export function result(folder: string, night = false): Result {
  return JSON.parse(readFileSync(resultFile(folder, night), 'utf8'))
}

/** What a test reads of a result file. */
export type Result = {
  tests: Record<string, string>
  measures: Record<string, unknown>
  pictures: Record<string, string>
}
