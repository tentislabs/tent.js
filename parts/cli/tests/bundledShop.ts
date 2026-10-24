import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildProject } from '../../build/index.ts'

// What the tests of a bundle of the shop share: the shop of `appShop/`, copied for each test with the files it
// hands, and built into a bundle, and a folder of its own.

const shop = fileURLToPath(new URL('./appShop/', import.meta.url))

/** An empty folder for one test under the folder that git leaves out, removed when the test ends. */
export function folderOf(t: TestContext, name: string): string {
  const folder = join(process.cwd(), 'results', 'bundled-shop', `${name}-${process.pid}-${Date.now()}`)
  mkdirSync(folder, { recursive: true })
  t.after(async () => {
    // What runs on the folder is ended before it goes: an engine that runs holds its files.
    const ends = endings.get(t) ?? []
    endings.delete(t)
    for (const one of ends) await one()
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  })
  return folder
}

// What each test hands to be ended before its folders go.
const endings = new WeakMap<TestContext, (() => Promise<void>)[]>()

/** Hands a test what is to be ended with it, before its folders are removed. */
export function endedWith(t: TestContext, end: () => Promise<void>): void {
  endings.set(t, [...(endings.get(t) ?? []), end])
}

/** Copies the shop into a folder, with the files that are handed beside it, by their paths. Answers the folder of the project. */
export function shopIn(folder: string, o: { files?: Record<string, string>; name?: string } = {}): string {
  const project = join(folder, o.name ?? 'shop')
  cpSync(shop, project, { recursive: true })
  for (const [path, text] of Object.entries(o.files ?? {})) {
    mkdirSync(join(project, path, '..'), { recursive: true })
    writeFileSync(join(project, path), text)
  }
  return project
}

/** Builds a project into its bundle, as a release is built. Throws with the findings where it does not build. */
export async function bundleOf(project: string): Promise<string> {
  const built = await buildProject(project, { for: 'release' })
  const errors = built.findings.filter((one) => one.level === 'error')
  if (errors.length) throw new Error(errors.map((one) => `${one.code} ${one.message}`).join('\n'))
  return built.bundleFolder
}
