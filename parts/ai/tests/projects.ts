import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'

/** Makes an empty folder for one test, under the folder that git leaves out. It is removed when the test ends. */
export function workFolder(t: TestContext): string {
  const all = join(process.cwd(), 'results', 'ai')
  mkdirSync(all, { recursive: true })
  const folder = mkdtempSync(join(all, 'work-'))
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  return folder
}

/**
 * Copies a project of the tests into a folder of the test, where a build may write beside its files, and answers
 * the place of the copy.
 */
export function copyOf(t: TestContext, name: string): string {
  const copy = join(workFolder(t), name)
  cpSync(join(import.meta.dirname, name), copy, { recursive: true })
  return copy
}
