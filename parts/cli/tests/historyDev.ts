import assert from 'node:assert/strict'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import { copied, typed } from './typed.ts'

export const system = { kind: 'system' } as const
export const why = "anyone('a project of the tests, which nobody else reaches')"

/** Waits until something holds, and fails where it never does. It waits for what it reads, and for no length of time. */
export async function untilTried(what: string, holds: () => boolean | Promise<boolean>, tries = 1500): Promise<void> {
  for (let n = 0; n < tries; n++) {
    if (await holds()) return
    await new Promise((done) => setTimeout(done, 10))
  }
  assert.fail(`never: ${what}`)
}

/** The files of a small project with no screen: a table of items, a query, a change, and the starter data. */
export const files = (o: { limits?: string; tables?: string; functions?: string } = {}): Record<string, string> => ({
  'tent.ts': `import { project } from 'tentjs'\n\nexport const notes = project('notes', {\n  title: 'Notes',${o.limits ? `\n  limits: ${o.limits},` : ''}\n})\n`,
  'tables.ts':
    o.tables ??
    `import { anyone, table, text } from 'tentjs'\n\nexport const items = table('items', {\n  columns: { title: text() },\n  access: { read: 'anyone', add: ${why} },\n})\n`,
  'functions.ts':
    o.functions ??
    `import { anyone, change, input, query, text } from 'tentjs'\nimport { items } from './tables'\n\nexport const allItems = query('allItems', { access: 'anyone', rows: items.oldest('createdAt').limit(100) })\n\nexport const addItem = change('addItem', {\n  access: ${why},\n  input: { title: text() },\n  set: items.add({ title: input('title') }),\n})\n`,
  'seed.ts': `import { seed } from 'tentjs'\n\nexport default seed(({ db }) => {\n  db.items.add({ title: 'seeded' })\n})\n`,
})

/** A copy of the project of these tests with the files that a test gives it in the place of its own. */
export function projectOf(t: TestContext, name: string, o: Parameters<typeof files>[0] = {}): string {
  const folder = copied(t, name, 'devs')
  rmSync(join(folder, 'screens.tsx'))
  for (const [path, text] of Object.entries(files(o))) writeFileSync(join(folder, path), text)
  return folder
}

/** `tent dev` on a project of these tests, on a port that the system gives, ended when the test ends. */
export async function developed(t: TestContext, name: string, o: Parameters<typeof files>[0] = {}): Promise<Dev> {
  // The session is ended before its folder is removed: what a test asks for at its end is done in the order asked.
  let started: Dev | undefined
  t.after(() => started?.close())
  started = await startDev(projectOf(t, name, o), { port: 0, out: () => undefined })
  return started
}

/** What `tent history` answers with `--json`, which must end with 0. */
export async function history(folder: string, ...words: string[]): Promise<Record<string, unknown>> {
  const answered = await typed(folder, 'history', ...words, '--json')
  assert.equal(answered.ended, 0, answered.printed)
  assert.equal(answered.answer.ok, true)
  return Object(answered.answer.value)
}

export interface Listed {
  id: string
  at: number
  kind: string
  name?: string
  checked?: boolean
  files?: number
}

export const pointsOf = async (folder: string): Promise<Listed[]> => Object(await history(folder)).points

/** Saves a file with one text in the place of another, and waits until the session runs the version of that save. */
export async function saved(dev: Dev, file: string, from: string, to: string): Promise<void> {
  const before = dev.version()
  const held = readFileSync(join(dev.folder, file), 'utf8')
  assert.ok(held.includes(from), `${file} holds ${JSON.stringify(from)}`)
  writeFileSync(join(dev.folder, file), held.replace(from, to))
  await untilTried(`the save of ${file} runs`, () => dev.version() !== before)
}

/** Saves several files at once, and waits until the session runs the version of that save with no error. */
export async function wrote(dev: Dev, texts: Record<string, string>): Promise<void> {
  const before = dev.version()
  for (const [file, text] of Object.entries(texts)) writeFileSync(join(dev.folder, file), text)
  await untilTried(
    'the saved files run',
    () => dev.version() !== before && !dev.findings().some((one) => one.level === 'error'),
  )
}

export const titles = async (dev: Dev, query = 'allItems'): Promise<unknown[]> =>
  Object(await dev.app().call(query, {}, { as: system })).map((row: Record<string, unknown>) => row.title ?? row.name)
