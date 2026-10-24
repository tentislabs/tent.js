import assert from 'node:assert/strict'
import fs, { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import promises from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { join, relative, sep } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { measure } from '../../../rig/budgets.ts'
import type { Page } from '../../../rig/browser.ts'
import { inBrowser } from '../../../rig/browser.ts'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import { connectionStands } from './standing.ts'
import { root } from './typed.ts'

// The project of the measure: 100 backend files of a table and three functions each, 200 screens, every tenth of
// them code, and four components that 50 screens each draw.
const backends = 100
const screens = 200
const shared = 4

/** Writes the large project into a folder of its own, removed when the test ends. */
function largeProject(t: TestContext): string {
  const folder = join(root, 'results', 'cli', 'saved-large', 'shelf')
  rmSync(join(folder, '..'), { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  t.after(() => rmSync(join(folder, '..'), { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const put = (path: string, text: string): void => {
    mkdirSync(join(folder, path, '..'), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  put('tent.ts', "import { project } from 'tentjs'\n\nexport const shelf = project('shelf', { title: 'Shelf' })\n")
  for (let n = 0; n < backends; n++)
    put(
      `functions/f${n}.ts`,
      [
        "import { change, input, query, table, text } from 'tentjs'",
        '',
        `export const items${n} = table('items${n}', { columns: { title: text() }, access: { read: 'anyone', add: 'signedIn' } })`,
        '',
        `export const list${n} = query('list${n}', { access: 'anyone', rows: items${n}.oldest('title').limit(20) })`,
        '',
        `export const label${n} = query('label${n}', { access: 'anyone', output: text(), run: () => 'Label ${n} first' })`,
        '',
        `export const add${n} = change('add${n}', {`,
        "  access: 'signedIn',",
        '  input: { title: text() },',
        `  set: items${n}.add({ title: input('title') }),`,
        '})',
        '',
      ].join('\n'),
    )
  for (let k = 0; k < shared; k++)
    put(
      `components/shared${k}.tsx`,
      [
        "import { component } from 'tentjs/ui'",
        '',
        `export const Shared${k} = component('Shared${k}', { view: () => <span>Shared ${k} first</span> })`,
        '',
      ].join('\n'),
    )
  for (let n = 0; n < screens; n++) {
    const code = n % 10 === 9
    put(
      `screens/s${n}.tsx`,
      [
        `import { screen, read, boolean, Link } from 'tentjs/ui'`,
        ...(code ? ["import { useState } from 'react'"] : []),
        `import { label${n % backends} } from '../functions/f${n % backends}'`,
        `import { Shared${n % shared} } from '../components/shared${n % shared}'`,
        '',
        `export const s${n} = screen('s${n}', {`,
        `  path: '/s${n}',`,
        "  access: 'anyone',",
        '  state: { open: { type: boolean() } },',
        `  data: { label: read(label${n % backends}) },`,
        code
          ? '  view: ({ label, state }) => {\n    const [seen] = useState(1)\n    return (\n      <div>\n'
          : '  view: ({ label, state }) => (\n    <div>\n',
        `      <h1>Screen ${n} first</h1>`,
        '      <span>{label}</span>',
        `      <Shared${n % shared} />`,
        '      <Link set={{ open: true }}>Open it</Link>',
        "      <span>{state.open ? 'Opened' : 'Closed'}</span>",
        ...(code ? ['      <span>{seen}</span>'] : []),
        code ? '    </div>\n    )\n  },' : '    </div>\n  ),',
        '})',
        '',
      ].join('\n'),
    )
  }
  return folder
}

/** Saves a file of the project with one text in the place of another, as an editor does: the whole file is written. */
const saveIn =
  (folder: string) =>
  (file: string, from: string, to: string): void => {
    const held = readFileSync(join(folder, file), 'utf8')
    assert.ok(held.includes(from), `${file} holds ${JSON.stringify(from)}`)
    writeFileSync(join(folder, file), held.replace(from, to))
  }

/** What the page itself says once it shows a text: a wait that asks again and again adds its own pauses. */
const shows = (page: Page, text: string): Promise<void> =>
  page.evaluate(
    (words) =>
      new Promise<void>((done, failed) => {
        // A save that never reaches the page fails the test, and holds no run for ever.
        setTimeout(() => failed(new Error(`the page never showed ${words}`)), 120_000)
        const seen = (): boolean => (document.querySelector('#tent')?.textContent ?? '').includes(words)
        if (seen()) return done()
        const watching = new MutationObserver(() => {
          if (!seen()) return
          watching.disconnect()
          done()
        })
        watching.observe(document.body, { subtree: true, childList: true, characterData: true })
      }),
    text,
  )

/**
 * Every file that this program writes from now on, by where it lies, while `watch` runs: through the runtime's own
 * functions that write or copy a file, as the build calls them. A link to a file that stands already writes none.
 */
async function writtenWhile(watch: () => Promise<void>): Promise<string[]> {
  const written: string[] = []
  const wrap = (holder: object, name: string): (() => void) => {
    const was: unknown = Reflect.get(holder, name)
    if (typeof was !== 'function') return () => undefined
    Reflect.set(holder, name, (...given: unknown[]) => {
      written.push(String(name === 'copyFileSync' || name === 'cpSync' ? given[1] : given[0]))
      return Reflect.apply(was, holder, given)
    })
    return () => Reflect.set(holder, name, was)
  }
  const undo = [
    wrap(fs, 'writeFileSync'),
    wrap(fs, 'copyFileSync'),
    wrap(fs, 'cpSync'),
    wrap(promises, 'writeFile'),
    wrap(promises, 'copyFile'),
  ]
  syncBuiltinESMExports()
  try {
    await watch()
  } finally {
    for (const one of undo) one()
    syncBuiltinESMExports()
  }
  return written
}

/**
 * The files of the running version among what was written, each by its path in the version, and nothing of the
 * description. A version is the list of its files, each kept once by its fingerprint: a file written into the
 * store is named by the paths that the list of the version gives its fingerprint, and the list itself is the one
 * other file written. Fails where anything else under the build's folder was written.
 */
function modulesWritten(written: string[], dev: Dev): string[] {
  const builds = join(dev.folder, '.tent', 'build')
  const list = join(builds, `${dev.version()}.json`)
  const files: Record<string, string> = JSON.parse(readFileSync(list, 'utf8')).files
  const pathsOf = new Map<string, string[]>()
  for (const [path, print] of Object.entries(files)) pathsOf.set(print, [...(pathsOf.get(print) ?? []), path])
  const inBuild = written.filter((file) => file.startsWith(builds + sep))
  const stored = inBuild.filter((file) => relative(builds, file).split(sep)[0] === 'files')
  assert.deepEqual(
    inBuild.filter((file) => !stored.includes(file)).map((file) => relative(builds, file)),
    [`${dev.version()}.json`],
    'a save writes the files whose bytes changed and the list of its version, and nothing else of the build',
  )
  return [
    ...new Set(
      stored
        .flatMap((file) => pathsOf.get(relative(join(builds, 'files'), file)) ?? [`an unlisted ${file}`])
        .filter((name) => !name.startsWith('description.')),
    ),
  ].sort()
}

/** Waits until something holds, and fails where it never does: it waits for what it reads, and for no length of time. */
async function until(what: string, holds: () => boolean, tries = 12000): Promise<void> {
  for (let n = 0; n < tries; n++) {
    if (holds()) return
    await new Promise((done) => setTimeout(done, 10))
  }
  assert.fail(`never: ${what}`)
}

test('[31-21] on a project of 200 screens and 300 functions, a save of a screen file, of a backend file and of a file that 50 screens import reaches an open page within save.seen, writes only the modules that changed, and keeps the state of the open view', async (t) => {
  // The session is ended before its folder is removed: the hooks of a test run in the order they were given.
  let started: Dev | undefined
  t.after(() => started?.close())
  const folder = largeProject(t)
  const save = saveIn(folder)
  const dev = await startDev(folder, { port: 0, out: () => undefined })
  started = dev
  await inBrowser('chromium', async (page) => {
    const stands = connectionStands(page)
    await page.goto(`http://localhost:${dev.port}/s7`)
    await page.locator('#tent[data-t-alive]').waitFor()
    await stands
    // The open view holds a state of its own, which no save takes away.
    await page.getByText('Open it').click()
    await page.getByText('Opened').waitFor()
    const words = { screen: 'Screen 7 first', label: 'Label 7 first', shared: 'Shared 3 first' }
    let round = 0
    const saved = async (kind: keyof typeof words, file: string): Promise<number> => {
      const next = `${words[kind].split(' ').slice(0, 2).join(' ')} saved ${++round}`
      const seen = shows(page, next)
      const began = performance.now()
      save(file, words[kind], next)
      words[kind] = next
      await seen
      return performance.now() - began
    }
    // What one save writes into the bundle of its new version: only the modules that the saved file changed.
    const once = async (kind: keyof typeof words, file: string): Promise<string[]> => {
      const before = dev.version()
      const written = await writtenWhile(async () => {
        await saved(kind, file)
        await until('the save is the running version', () => dev.version() !== before)
      })
      return modulesWritten(written, dev)
    }
    const screen = await once('screen', 'screens/s7.tsx')
    assert.ok(screen.length > 0, 'a saved screen writes its module')
    assert.deepEqual(
      screen.filter((name) => !/^(browser|server)\/(?:src\.)?screens\.s7\./.test(name)),
      [],
      'the saved screen writes its own module alone',
    )
    // A backend file of the project's own words holds no module: its save writes nothing but the description.
    assert.deepEqual(await once('label', 'functions/f7.ts'), [])
    // A file that 50 screens import writes its own module alone: each module that imports it names it by its address,
    // which holds no fingerprint, and is not written again.
    assert.deepEqual(await once('shared', 'components/shared3.tsx'), [
      'browser/src.components.shared3.tsx.js',
      'browser/src.components.shared3.tsx.js.map',
      'server/src.components.shared3.tsx.js',
      'server/src.components.shared3.tsx.js.map',
    ])
    // Each save reaches the open page within the bar, with the state of its view kept.
    await measure('save.seen', () => saved('screen', 'screens/s7.tsx'), { unit: 'ms', warm: true })
    await measure('save.seen', () => saved('label', 'functions/f7.ts'), { unit: 'ms', warm: true })
    await measure('save.seen', () => saved('shared', 'components/shared3.tsx'), { unit: 'ms', warm: true })
    assert.equal(await page.getByText('Opened').count(), 1)
  })
})

test('[31-22] on the project of 200 screens and 300 functions, a save of the view of a component that 50 screens import is taken in place by Fast Refresh within save.seen: no screen is asked for again, no importer is written again, and what the open view keeps stays', async (t) => {
  let started: Dev | undefined
  t.after(() => started?.close())
  const folder = largeProject(t)
  const save = saveIn(folder)
  const dev = await startDev(folder, { port: 0, out: () => undefined })
  started = dev
  await inBrowser('chromium', async (page) => {
    const screens: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/_t/screen') screens.push(request.url())
    })
    // The screen draws the component that the save changes, and its view keeps a number in React.
    const stands = connectionStands(page)
    await page.goto(`http://localhost:${dev.port}/s9`)
    await page.locator('#tent[data-t-alive]').waitFor()
    await stands
    await page.getByText('Open it').click()
    await page.getByText('Opened').waitFor()
    let words = 'Shared 1 first'
    let round = 0
    const saved = async (): Promise<number> => {
      const next = `Shared 1 swapped ${++round}`
      const seen = shows(page, next)
      const began = performance.now()
      save('components/shared1.tsx', words, next)
      words = next
      await seen
      return performance.now() - began
    }
    const before = dev.version()
    const written = await writtenWhile(async () => {
      await saved()
      await until('the save is the running version', () => dev.version() !== before)
    })
    assert.deepEqual(modulesWritten(written, dev), [
      'browser/src.components.shared1.tsx.js',
      'browser/src.components.shared1.tsx.js.map',
      'server/src.components.shared1.tsx.js',
      'server/src.components.shared1.tsx.js.map',
    ])
    await measure('save.seen', saved, { unit: 'ms', warm: true })
    assert.deepEqual(screens, [], 'no screen is asked for again')
    assert.equal(await page.getByText('Opened').count(), 1)
  })
})
