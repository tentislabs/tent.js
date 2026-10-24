import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

/** A change of one file of a copied project: a text that is put in the place of another. */
export interface Edit {
  file?: string
  from: string
  to: string
}

/** Puts the text of each edit in its place in the copy, and fails where the text it replaces is not there. */
export function edited(folder: string, edits: Edit[]): void {
  for (const { file = 'tent.ts', from, to } of edits) {
    const path = join(folder, file)
    const text = readFileSync(path, 'utf8')
    if (!text.includes(from)) throw new Error(`${file} of the copy holds no ${JSON.stringify(from)}`)
    writeFileSync(path, text.replace(from, to))
  }
}

/** A project of the tests, copied into a folder of the test and changed by the edits: the place of the copy. */
export function mcpProject(t: TestContext, edits: Edit[] = [], name = 'mcped'): string {
  const folder = copyOf(t, name)
  edited(folder, edits)
  return folder
}

/** The project of the MCP door, copied and changed by the edits, as a test app that is closed when the test ends. */
export async function mcpApp(t: TestContext, edits: Edit[] = [], name = 'mcped'): Promise<TestApp> {
  return opened(t, mcpProject(t, edits, name))
}

/** A project folder as a test app that is closed when the test ends. */
export async function opened(t: TestContext, folder: string): Promise<TestApp> {
  const app = await testApp({ folder })
  closing(t, () => app.close())
  return app
}

/** Two people of the app, each with their email, as callers. */
export async function people(app: TestApp): Promise<{ ada: Caller; bob: Caller }> {
  return { ada: await app.user({ email: 'ada@example.com' }), bob: await app.user({ email: 'bob@example.com' }) }
}

/** The id of a user that a caller is. */
export const callerIdOf = (caller: Caller): string => String(caller.user?.id)

/** What a tool's answer holds in the part that is kept from the model: the wire error of a failure, by its code. */
export function errorOf(result: Record<string, unknown>): Record<string, unknown> {
  const kept = Object(result._meta)
  return Object(kept['tent.error'])
}

/** The one text of a tool's answer that the model is given. */
export function textOf(result: Record<string, unknown>): string {
  const [first] = Array.isArray(result.content) ? result.content : []
  return String(Object(first).text)
}
