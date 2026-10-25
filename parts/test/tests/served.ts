import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { after } from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import type { Description } from '../../core/internal.ts'
import { buildProject } from '../../build/index.ts'
import type { App, Engine } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'

// What the tests of a file started and made: each engine is closed and each folder removed when the file ends,
// also where a test failed.
const engines: Engine[] = []
const folders: string[] = []
after(async () => {
  for (const engine of engines) await engine.close()
  for (const folder of folders) rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

/** A project of the tests as it is served: the address it is reached by, its app, and what the build made of it. */
export interface Served {
  address: string
  app: App
  description: Description
  bundleFolder: string
  // Where the app keeps its data and its logs.
  dataFolder: string
}

/**
 * Takes the name of a project that lies beside the tests. Builds a copy of it and serves it on a port that the
 * system gives, on this computer, in the mode `test` or the one `mode` names, with its starter data. `change` may write files of the copy
 * anew before the build. Answers the address it is reached by, the app, and what the build made.
 */
export async function served(
  project: string,
  o: {
    for?: 'dev' | 'release'
    change?: (folder: string) => void
    mode?: 'test' | 'development'
  } = {},
): Promise<Served> {
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  const work = mkdtempSync(join(all, `${project}-`))
  folders.push(work)
  const folder = join(work, project)
  cpSync(join(import.meta.dirname, project), folder, { recursive: true })
  o.change?.(folder)
  const made = await buildProject(folder, {
    for: o.for ?? 'release',
  })
  assert.deepEqual(made.findings, [])
  const engine = createEngine({ port: 0 })
  engines.push(engine)
  const dataFolder = join(work, 'data')
  const app = await engine.open(made.bundleFolder, { dataFolder, mode: o.mode ?? 'test' })
  await app.seed()
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  return {
    address: `http://localhost:${port}`,
    app,
    description: made.description,
    bundleFolder: made.bundleFolder,
    dataFolder,
  }
}

/** What a page wrote that no page should: each error it threw, and each error and warning of its console. */
export function complaintsOf(page: Page): string[] {
  const said: string[] = []
  page.on('pageerror', (error) => said.push(`thrown: ${error.message}`))
  page.on('console', (message) => {
    // A browser may note that a file which the page named ahead was not used yet: the module of the `error`
    // screen is named ahead and loaded only when a view fails. That note is no complaint of the page.
    if (/was preloaded using link preload but not used/.test(message.text())) return
    // A project of the tests names a made-up host to connect to ahead, which a computer that resolves no such name
    // fails to reach; WebKit notes it, though the page asks nothing of that host.
    if (/^Failed to preconnect to https:\/\/[\w.-]+\.example\.com\//.test(message.text())) return
    // Firefox notes a site that many pages open with no press of a person as one that tracks, as the tests open
    // `localhost` again and again: that note is of the tests, and not of the page.
    if (/“localhost” has been classified as a bounce tracker/.test(message.text())) return
    if (message.type() === 'error' || message.type() === 'warning') said.push(`${message.type()}: ${message.text()}`)
  })
  return said
}

/** Opens an address, and waits until the page has come alive: from then on a press is taken. */
export async function alive(page: Page, address: string): Promise<void> {
  await page.goto(address)
  await page.locator('#tent[data-t-alive]').waitFor()
}
