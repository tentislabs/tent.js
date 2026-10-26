import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import type { Typed } from './typed.ts'
import { copied, shell } from './typed.ts'

/** The project `recorded` beside these tests, copied, with what the folders that `more` names lay over it. */
export function recordedCopy(t: TestContext, name: string, ...more: string[]): string {
  const project = copied(t, name, 'recorded')
  for (const one of more) cpSync(join(import.meta.dirname, one), project, { recursive: true })
  // A program that a test starts keeps what it makes under the folder of the project, which the test removes.
  mkdirSync(join(project, '..', 'temp'), { recursive: true })
  return project
}

/** `tent test` as a person types it, in a program of its own: the runner starts no run of tests inside a test. */
export function tested(project: string, ...words: string[]): Typed {
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const temp = join(project, '..', 'temp')
  const ended = spawnSync(process.execPath, [shell, 'test', ...words], {
    cwd: project,
    encoding: 'utf8',
    timeout: 300_000,
    env: { ...env, TEMP: temp, TMP: temp, TMPDIR: temp },
  })
  let answer: Typed['answer'] = {}
  try {
    answer = Object(JSON.parse(ended.stdout))
  } catch {
    // What is printed as text is read as text.
  }
  return { ended: ended.status ?? -1, printed: ended.stdout + ended.stderr, answer }
}
