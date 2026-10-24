// What the tests that drive a real browser share: the app of the pages, served on this computer, and the waits.
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after } from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { buildProject } from '../../build/index.ts'
import type { Engine } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'

// What the tests of a file started and made: each engine is closed and each folder removed when the file ends,
// also where a test failed.
const engines: Engine[] = []
const folders: string[] = []
after(async () => {
  for (const engine of engines) await engine.close()
  for (const folder of folders) rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

/** An app that is served for a test: the address it is reached by, and where its data lies. */
interface Served {
  origin: string
  dataFolder: string
}

/**
 * Builds the project of the pages and serves it on a port that the system gives, on this computer, with its
 * starter data. `change` may write the project file anew before the build.
 */
async function servedApp(change?: (written: string) => string): Promise<Served> {
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  const work = mkdtempSync(join(all, 'browser-'))
  folders.push(work)
  const folder = join(work, 'pages')
  cpSync(join(import.meta.dirname, 'pages'), folder, { recursive: true })
  // Three engines ask from one address within a minute: the counts of a minute are set far above what they ask,
  // so that no test is answered by a count.
  const written = readFileSync(join(folder, 'tent.ts'), 'utf8')
  assert.match(written, /project\('shop', \{/)
  const counted = written.replace(
    "project('shop', {",
    "project('shop', {\n  limits: { anyonePerMinute: 100000, screensPerMinute: 100000 },",
  )
  writeFileSync(join(folder, 'tent.ts'), change ? change(counted) : counted)
  const made = await buildProject(folder, { for: 'dev' })
  assert.deepEqual(made.findings, [])
  const engine = createEngine({ port: 0 })
  engines.push(engine)
  const dataFolder = join(work, 'data')
  const app = await engine.open(made.bundleFolder, { dataFolder, mode: 'test' })
  await app.seed()
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  return { origin: `http://localhost:${port}`, dataFolder }
}

/** Answers the address of an app as `servedApp` serves it. */
export const servedOrigin = async (change?: (written: string) => string): Promise<string> =>
  (await servedApp(change)).origin

// The app as its project writes it is built and served once for the tests of a file: each of them counts from
// what it finds, and none leans on what another left.
let common: Promise<string> | undefined

/** The address of the app of the pages as its project writes it, served once for the file that asks. */
export const shop = (): Promise<string> => {
  common ??= servedOrigin()
  return common
}

/** Opens an address of the app, and waits until the page has come alive: from then on a press is taken. */
export async function openedAlive(page: Page, address: string): Promise<void> {
  await page.goto(address)
  await page.locator('#tent[data-t-alive]').waitFor()
}

/**
 * Holds every call of a function back until the test lets it go, and counts them: so a test sees a press while
 * its call is under way, for as long as it looks, and with no length of time. With `'read'` it holds every read
 * of a query or an action back, as a page asks one.
 */
export async function held(
  page: Page,
  name: string,
  door: 'call' | 'read' = 'call',
): Promise<{ calls(): number; go(): void }> {
  let calls = 0
  let free = false
  const waiting: (() => void)[] = []
  await page.route(`**/_t/${door}/${name}`, async (route) => {
    calls += 1
    if (!free) await new Promise<void>((done) => waiting.push(done))
    await route.continue()
  })
  return {
    calls: () => calls,
    go: () => {
      free = true
      for (const done of waiting.splice(0)) done()
    },
  }
}

/** The heading of the page, which counts the orders that the screen was last answered. */
export const counted = (page: Page, n: number) => page.getByRole('heading', { name: `${n} orders` }).waitFor()

/** The number of orders that the heading of the page shows. */
export const shownOrders = async (page: Page): Promise<number> =>
  Number(/(\d+) orders/.exec(await page.getByRole('heading').innerText())?.[1])
