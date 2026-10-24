import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import { copied } from './typed.ts'

/** Waits until something holds, and fails where it never does. It waits for what it reads, and for no length of time. */
async function until(what: string, holds: () => boolean | Promise<boolean>, tries = 3000): Promise<void> {
  for (let n = 0; n < tries; n++) {
    if (await holds()) return
    await new Promise((done) => setTimeout(done, 10))
  }
  assert.fail(`never: ${what}`)
}

/** `tent dev` on a copy of the project that fails, on a port that the system gives, ended when the test ends. */
async function developed(t: TestContext) {
  let started: Dev | undefined
  t.after(() => started?.close())
  const folder = copied(t, 'failing', 'failing')
  const lines: string[] = []
  const dev = await startDev(folder, { port: 0, out: (line) => lines.push(line) })
  started = dev
  return { folder, lines, dev, origin: `http://localhost:${dev.port}` }
}

/** The text of a file of the project as the build counts it: with one line ending. */
const textIn = (folder: string, file: string): string =>
  readFileSync(join(folder, file), 'utf8').replace(/\r\n?/g, '\n')

/** Saves a file of a project with one text in the place of another, as an editor does, and waits for the version it runs. */
async function saved(dev: Dev, file: string, from: string, to: string): Promise<void> {
  const held = textIn(dev.folder, file)
  assert.ok(held.includes(from), `${file} holds ${JSON.stringify(from)}`)
  const before = dev.version()
  writeFileSync(join(dev.folder, file), held.replace(from, to))
  await until(`the save of ${file} runs`, () => dev.version() !== before)
}

/** Where a throw stands in a file: its line, and the first and last column of its statement, counted from 1. */
function placeOf(text: string, sought: string): { line: number; first: number; last: number; lines: string[] } {
  const at = text.indexOf(sought)
  assert.ok(at >= 0, `the file holds ${sought}`)
  const lines = text.split('\n')
  const line = text.slice(0, at).split('\n').length
  const first = at - text.lastIndexOf('\n', at - 1)
  return { line, first, last: first + sought.length - 1, lines }
}

// What names a place in the framework, in a package or in a bundle: none stands unfolded in the chain of calls.
const outside =
  /parts[\\/]|node_modules|page\.(dev\.)?[a-z-]*\.?[0-9a-f]{12}\.js|\/_t\/b\/|\.tent[\\/]build|node:|server[\\/]/

/**
 * Holds a failure as it is shown, in the overlay or in the terminal: its code and words, the file, the line and the
 * column of the project's source, the lines around it, and a chain of calls in which every line that names a place
 * names one of the project's files, and the rest is folded.
 */
function heldFailure(
  shown: string,
  o: { file: string; sought: string; words: string; text: string },
  said: string,
): void {
  const { line, first, last, lines } = placeOf(o.text, o.sought)
  assert.ok(shown.includes(o.words), `${said}: the words`)
  assert.match(shown, /T0009/, `${said}: the code`)
  const where = new RegExp(`${o.file.replace('.', '\\.')}:(\\d+):(\\d+)`).exec(shown)
  assert.ok(where, `${said}: the place in ${shown}`)
  assert.equal(Number(where[1]), line, `${said}: the line`)
  assert.ok(
    Number(where[2]) >= first && Number(where[2]) <= last,
    `${said}: the column ${where[2]}, of ${first} to ${last}`,
  )
  // The lines around it: the line itself, the one before it, and the two after it, each by its number.
  assert.ok(shown.includes(lines[line - 1].trim()), `${said}: the line of the throw`)
  assert.ok(shown.includes(lines[line - 2].trim()), `${said}: the line before it`)
  for (const after of [line + 1, line + 2])
    assert.ok(shown.includes(`${after} | ${lines[after - 1]}`), `${said}: the line ${after}, after it`)
  const calls = shown.slice(shown.indexOf('calls'))
  assert.ok(calls.length < shown.length, `${said}: the chain of calls`)
  for (const one of calls.split('\n').slice(1))
    if (outside.test(one)) assert.match(one.trim(), /^…/, `${said}: a line of the framework stands unfolded: ${one}`)
  assert.ok(
    calls.split('\n').some((one) => one.includes(`${o.file}:`)),
    `${said}: a call of the project's file`,
  )
}

/**
 * Opens an address of the app. A page of development follows each save, and may load its address anew at the
 * moment it is sent away: the browser then says the load was ended, and it is asked once more.
 */
async function visited(page: Page, address: string): Promise<void> {
  for (let tries = 0; ; tries++) {
    try {
      await page.goto(address)
      return
    } catch (error) {
      if (tries > 3 || !/ABORTED|interrupted/i.test(String(error))) throw error
    }
  }
}

/** The text of the overlay of a page, once it shows what holds. */
async function overlaid(page: Page, words: string): Promise<string> {
  const overlay = page.locator('#tent-overlay')
  await overlay.waitFor()
  // The overlay shows each finding and each failure apart: the one that holds the words is read.
  const one = overlay.locator('p', { hasText: words })
  await until(`the overlay shows ${words}`, async () => (await one.count()) > 0)
  return one.first().innerText()
}

/** What the terminal said of a failure since a line, once it names the project's file. */
async function told(lines: string[], from: number, words: string, path: string): Promise<string> {
  await until(`the terminal tells ${words}`, () =>
    lines.slice(from).some((one) => one.includes(words) && one.includes(path)),
  )
  return lines.slice(from).find((one) => one.includes(words) && one.includes(path)) ?? ''
}

test('[31-19] development: a view that throws as it draws, on the server and in the browser, an action that throws, and a flow step that throws each show in the overlay and the terminal by the place in the project source, and fixing the file takes the overlay away', async (t) => {
  const { dev, origin, lines, folder } = await developed(t)
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = (what: string): string => `${what}, in ${engine}`
      // A view that throws as it draws on the server: the page is the error screen, and shows the overlay.
      let from = lines.length
      await saved(dev, 'screens.tsx', 'const serverBreaks = false', 'const serverBreaks = true')
      await visited(page, `${origin}/server`)
      const server = {
        file: 'screens.tsx',
        sought: "throw new Error('The view broke on the server')",
        words: 'The view broke on the server',
      }
      heldFailure(
        await overlaid(page, server.words),
        { ...server, text: textIn(folder, 'screens.tsx') },
        said('the server'),
      )
      heldFailure(
        await told(lines, from, server.words, join(folder, 'screens.tsx')),
        { ...server, text: textIn(folder, 'screens.tsx') },
        said('the terminal of the server'),
      )
      await saved(dev, 'screens.tsx', 'const serverBreaks = true', 'const serverBreaks = false')
      await page.locator('#tent-overlay').waitFor({ state: 'detached' })

      // A view that throws as it draws in the browser.
      from = lines.length
      await visited(page, `${origin}/browser`)
      await page.locator('#tent[data-t-alive]').waitFor()
      await page.getByText('Break it', { exact: true }).click()
      const browser = {
        file: 'screens.tsx',
        sought: "throw new Error('The view broke in the browser')",
        words: 'The view broke in the browser',
      }
      heldFailure(
        await overlaid(page, browser.words),
        { ...browser, text: textIn(folder, 'screens.tsx') },
        said('the browser'),
      )
      heldFailure(
        await told(lines, from, browser.words, join(folder, 'screens.tsx')),
        { ...browser, text: textIn(folder, 'screens.tsx') },
        said('the terminal of the browser'),
      )
      await saved(dev, 'screens.tsx', 'Break it', `Broken no more in ${engine}`)
      await page.locator('#tent-overlay').waitFor({ state: 'detached' })
      await saved(dev, 'screens.tsx', `Broken no more in ${engine}`, 'Break it')

      // An action that throws, called by a press.
      from = lines.length
      await saved(dev, 'functions.ts', 'const actionBreaks = false', 'const actionBreaks = true')
      await visited(page, `${origin}/`)
      await page.locator('#tent[data-t-alive]').waitFor()
      await page.getByText('Explode', { exact: true }).click()
      const action = { file: 'functions.ts', sought: 'throw new Error(words)', words: 'The action broke' }
      heldFailure(
        await overlaid(page, action.words),
        { ...action, text: textIn(folder, 'functions.ts') },
        said('the action'),
      )
      heldFailure(
        await told(lines, from, action.words, join(folder, 'functions.ts')),
        { ...action, text: textIn(folder, 'functions.ts') },
        said('the terminal of the action'),
      )
      await saved(dev, 'functions.ts', 'const actionBreaks = true', 'const actionBreaks = false')
      await page.locator('#tent-overlay').waitFor({ state: 'detached' })

      // A step of a flow that throws.
      from = lines.length
      await saved(dev, 'functions.ts', 'const stepBreaks = false', 'const stepBreaks = true')
      await page.locator('#tent[data-t-alive]').waitFor()
      await dev.app().start('breaking', {}, { as: { kind: 'system' } })
      const step = { file: 'functions.ts', sought: "throw new Error('The step broke')", words: 'The step broke' }
      heldFailure(await overlaid(page, step.words), { ...step, text: textIn(folder, 'functions.ts') }, said('the step'))
      heldFailure(
        await told(lines, from, step.words, join(folder, 'functions.ts')),
        { ...step, text: textIn(folder, 'functions.ts') },
        said('the terminal of the step'),
      )
      await saved(dev, 'functions.ts', 'const stepBreaks = true', 'const stepBreaks = false')
      await page.locator('#tent-overlay').waitFor({ state: 'detached' })
    })
})

/** Every file under a folder, by its path from the folder, written with `/`. */
function filesUnder(folder: string, path = ''): string[] {
  return readdirSync(join(folder, path), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(folder, path ? `${path}/${entry.name}` : entry.name)
      : [path ? `${path}/${entry.name}` : entry.name],
  )
}

test('[31-19] a release build of the same project holds no source map, and the address of one answers not found; a development build holds one for every module it writes, served in development alone', async (t) => {
  // The engine is closed before the folders are removed: what a test asks for at its end is done in the order asked.
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const release = await buildProject(copied(t, 'failing-release', 'failing'), { for: 'release' })
  assert.deepEqual(
    release.findings.filter((one) => one.level === 'error'),
    [],
  )
  assert.deepEqual(
    filesUnder(release.bundleFolder).filter((one) => one.endsWith('.map')),
    [],
  )
  const development = await buildProject(copied(t, 'failing-dev', 'failing'), { for: 'dev' })
  const files = filesUnder(development.bundleFolder)
  // Every module that the build wrote has its map beside it: the server modules, the module of each file of the
  // project that a view reaches, on both sides, and the page code's own. The small files that hand a name of the page
  // code on, the module of a view and of the error screen, which give their records, and the modules of stubs, which
  // the build made up, hold no line of the project: the code of a view is in the module of its file.
  const modules = files.filter(
    (file) =>
      file.endsWith('.js') &&
      !/^browser\/page\.(react|tentjs)[a-z-]*\./.test(file) &&
      !/\/(screens\.\w+|tent\.error|made\.[\w.-]+)\./.test(file),
  )
  for (const one of modules) assert.ok(files.includes(`${one}.map`), `the map of ${one}`)
  const source = readFileSync(join(development.bundleFolder, '..', '..', '..', 'screens.tsx'), 'utf8')
  for (const side of ['browser', 'server']) {
    const view = files.find((one) => one.startsWith(`${side}/screens.browserScreen.`)) ?? ''
    const shared = /"\.\/(src\.[\w.-]+\.js)"/.exec(readFileSync(join(development.bundleFolder, view), 'utf8'))?.[1]
    assert.ok(shared && files.includes(`${side}/${shared}.map`), `the code of a view on the ${side} side has its map`)
    const map = JSON.parse(readFileSync(join(development.bundleFolder, `${side}/${shared}.map`), 'utf8'))
    assert.deepEqual(map.sources, ['screens.tsx'], 'a source is named by its path from the project')
    assert.equal(map.sourcesContent[0], source.replace(/\r\n?/g, '\n'), 'the source as it is written')
  }
  assert.ok(
    modules.some((one) => /^browser\/page\.dev\.[0-9a-f]{12}\.js$/.test(one)),
    'the page code is a module',
  )
  assert.ok(
    modules.some((one) => /^server\/functions\./.test(one)),
    'a server module',
  )
  /** The address of a file of the bundle of an app, on the port that its engine wrote down. */
  const addressOf = (dataFolder: string, path: string): string =>
    `http://localhost:${JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).port}/_t/b/${path}`
  const main = files.find((one) => /^browser\/page\.dev\.[0-9a-f]{12}\.js$/.test(one))
  assert.ok(main, files.join('\n'))
  for (const [mode, status] of [
    ['development', 200],
    ['test', 404],
  ] as const) {
    const dataFolder = join(development.bundleFolder, '..', `data-${mode}`)
    const app = await engine.open(development.bundleFolder, { dataFolder, mode })
    const answer = await app.request(new Request(addressOf(dataFolder, `${main}.map`)))
    assert.equal(answer.status, status, `a map of a development build, in the mode ${mode}`)
    await app.close()
  }
  const dataFolder = join(release.bundleFolder, '..', 'data-release')
  const app = await engine.open(release.bundleFolder, { dataFolder, mode: 'test' })
  const shown = filesUnder(release.bundleFolder).find((one) => /^browser\/page\.[0-9a-f]{12}\.js$/.test(one))
  assert.ok(shown)
  assert.equal((await app.request(new Request(addressOf(dataFolder, shown)))).status, 200)
  assert.equal((await app.request(new Request(addressOf(dataFolder, `${shown}.map`)))).status, 404)
})
