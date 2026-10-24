import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { buildProject } from '../../build/index.ts'
import { hostOf } from './exporting.ts'
import type { Served } from './served.ts'
import { alive, complaintsOf, served } from './served.ts'

const origin = 'https://shop.example.com'
const base = '/shop'

// The project of the notes is built and served once for the tests of this file that write no row.
let common: Promise<Served> | undefined
const notes = (): Promise<Served> => {
  common ??= served('exported')
  return common
}

/** Builds a copy of the project of the notes as a release, with the screen of `/about` open to signed-in callers alone. */
async function closedAbout(): Promise<string> {
  const folder = join(mkdtempSync(join(process.cwd(), 'results', 'test', 'exported-')), 'exported')
  cpSync(join(import.meta.dirname, 'exported'), folder, { recursive: true })
  const file = join(folder, 'screens.tsx')
  const written = readFileSync(file, 'utf8')
  writeFileSync(file, written.replace("path: '/about',\n  access: 'anyone'", "path: '/about',\n  access: 'signedIn'"))
  const built = await buildProject(folder, { for: 'release' })
  assert.deepEqual(built.findings, [])
  return built.bundleFolder
}

/** Every file of a folder, by its path inside it with forward slashes. */
function filesIn(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((one) => one.isFile())
    .map((one) =>
      join(one.parentPath, one.name)
        .slice(folder.length + 1)
        .replaceAll('\\', '/'),
    )
    .sort()
}

/** The record of the page that an exported file holds. */
function recordOf(html: string): Record<string, unknown> {
  const found = /<script type="application\/json" id="tent-page">(.*?)<\/script>/s.exec(html)
  return Object(JSON.parse(found?.[1] ?? '{}'))
}

test('[32-13] app.export writes each public screen as nobody with its rows, the sitemap, robots.txt and 404.html, names what it left out, and warns of a screen that calls a function', async () => {
  const { app, dataFolder } = await notes()
  const folder = join(dataFolder, 'site')
  const made = await app.export(folder, { origin, base })
  const files = filesIn(folder)
  for (const file of [
    'index.html',
    'about/index.html',
    'notes/first/index.html',
    'add/index.html',
    '_t/s/index.json',
    '_t/s/about.json',
    '_t/s/notes/first.json',
    '404.html',
    'sitemap.xml',
    'robots.txt',
    '_t/export.json',
  ])
    assert.ok(files.includes(file), `${file} is written`)
  assert.ok(
    files.some((file) => file.startsWith('_t/b/browser/')),
    'the browser files are written',
  )
  assert.ok(!files.some((file) => file.startsWith('desk')), 'a screen that needs a sign-in is not written')
  assert.ok(made.pages.includes('/notes/first'))

  // A screen that needs a sign-in, one with values and no addresses, and the addresses that cannot be files.
  const why = (what: string): string | undefined => made.skipped.find((one) => one.what === what)?.why
  assert.ok(why('deskScreen'), JSON.stringify(made.skipped))
  assert.ok(why('pickedScreen'), JSON.stringify(made.skipped))
  assert.ok(why('/notes/a%2Fb'), JSON.stringify(made.skipped))
  assert.ok(why('/notes/why%3F'), JSON.stringify(made.skipped))
  // Of two addresses that differ only in capitals one is written, and the other is named.
  const capitals = ['/notes/second', '/notes/Second'].filter((one) => why(one) !== undefined)
  assert.equal(capitals.length, 1, JSON.stringify(made.skipped))
  assert.equal(files.filter((file) => /^notes\/second\/index\.html$/i.test(file)).length, 1)

  // A screen that calls a function is written, with a warning that names it.
  assert.deepEqual(
    made.findings.map((one) => [one.code, one.level]),
    [['T6016', 'warning']],
  )
  assert.match(made.findings[0].message, /addScreen/)

  // Each page shows its rows, says that it was exported for the public, and names the site with its base.
  const home = readFileSync(join(folder, 'index.html'), 'utf8')
  assert.match(home, /The first note/)
  assert.match(home, /href="\/shop\/notes\/first"/)
  assert.match(home, /src="\/shop\/_t\/b\/browser\//)
  const record = recordOf(home)
  assert.deepEqual([record.exported, record.base, record.mode, record.origin], [true, base, 'live', origin])
  assert.match(
    home,
    /<meta http-equiv="Content-Security-Policy" content="[^"]*https:\/\/shop\.example\.com\/shop\/_t\/b\//,
  )
  const about = readFileSync(join(folder, 'about/index.html'), 'utf8')
  assert.match(about, /<link rel="canonical" href="https:\/\/shop\.example\.com\/shop\/about">/)
  const moved = Object(JSON.parse(readFileSync(join(folder, '_t/s/notes/first.json'), 'utf8')))
  assert.equal(moved.ok, true)
  assert.equal(moved.value.screen, 'noteScreen')
  assert.equal(moved.value.exported, true)

  const sitemap = readFileSync(join(folder, 'sitemap.xml'), 'utf8')
  assert.match(sitemap, /<loc>https:\/\/shop\.example\.com\/shop\/notes\/first<\/loc>/)
  assert.doesNotMatch(sitemap, /desk/)
  // An export is made for the public, whatever mode the engine it asks is in.
  assert.match(readFileSync(join(folder, 'robots.txt'), 'utf8'), /Allow: \//)
  assert.match(readFileSync(join(folder, '404.html'), 'utf8'), /id="tent-page"/)
})

test('[32-13] app.export of a development build is refused, and an export with no origin names no site', async () => {
  const dev = await served('exported', { for: 'dev' })
  await assert.rejects(dev.app.export(join(dev.dataFolder, 'site')), { code: 'T0013' })
  const { app, dataFolder } = await notes()
  const folder = join(dataFolder, 'plain')
  await app.export(folder)
  const home = readFileSync(join(folder, 'index.html'), 'utf8')
  assert.equal(recordOf(home).origin, '')
  assert.doesNotMatch(home, /rel="canonical"/)
  assert.ok(!existsSync(join(folder, 'sitemap.xml')))
  assert.match(home, /src="\/_t\/b\/browser\//)
})

test('[32-13] [05-9.15] run a second time, an export removes a page that is no longer public and touches no other file', async () => {
  const { app, dataFolder } = await notes()
  const folder = join(dataFolder, 'again')
  await app.export(folder, { origin, base })
  writeFileSync(join(folder, 'keep.txt'), 'a file of the builder')
  writeFileSync(join(dataFolder, 'outside.txt'), 'a file beside the folder')
  // An entry of the list that is no plain path inside the folder is never removed.
  const list = Object(JSON.parse(readFileSync(join(folder, '_t/export.json'), 'utf8')))
  assert.equal(list.format, 'tent.export/1')
  list.files.push('../outside.txt')
  writeFileSync(join(folder, '_t/export.json'), JSON.stringify(list))
  const version = await app.add(await closedAbout())
  const made = await app.export(folder, { origin, base, version })
  assert.ok(made.skipped.some((one) => one.what === 'aboutScreen'))
  assert.ok(!existsSync(join(folder, 'about/index.html')))
  assert.ok(!existsSync(join(folder, '_t/s/about.json')))
  assert.ok(existsSync(join(folder, 'index.html')))
  assert.ok(existsSync(join(folder, 'keep.txt')))
  assert.ok(existsSync(join(dataFolder, 'outside.txt')))
  await app.drop(version)
})

/** Waits until the page shows the screen of a heading, at a path. */
async function shows(page: Page, heading: string, path: string): Promise<void> {
  await page.waitForFunction((wanted) => document.querySelector('h1')?.textContent === wanted, heading)
  assert.equal(new URL(page.url()).pathname, path)
}

for (const engine of browserEngines) {
  test(`[32-13] an export served by a plain host of files with no engine shows each public screen with its rows, moves between them, and opens no connection, where the host answers an unknown address with a page of its own, in ${engine}`, async () => {
    const { app, dataFolder } = await notes()
    const folder = join(dataFolder, `plain-${engine}`)
    // The pages name the site they are reached by: its scripts and styles come from there alone.
    const host = await hostOf(folder, base)
    await app.export(folder, { origin: host, base })
    await inBrowser(engine, async (page) => {
      const said = complaintsOf(page)
      const sockets: string[] = []
      page.on('websocket', (socket) => sockets.push(socket.url()))
      const asked: string[] = []
      page.on('request', (request) => {
        const url = new URL(request.url())
        asked.push(request.isNavigationRequest() ? `document ${url.pathname}` : url.pathname)
      })
      await alive(page, `${host}${base}/`)
      await shows(page, 'The notes', `${base}/`)
      assert.ok(await page.getByText('The first note').isVisible())
      // The page marks itself, so that a document that is loaded anew is seen.
      await page.evaluate(() => document.body.setAttribute('data-first', ''))
      await page.getByText('The first note').click()
      await shows(page, 'The first note', `${base}/notes/first`)
      await page.getByText('All notes').click()
      await shows(page, 'The notes', `${base}/`)
      assert.equal(await page.evaluate(() => document.body.hasAttribute('data-first')), true)
      assert.deepEqual(sockets, [])
      assert.ok(
        asked.every((one) => one.replace('document ', '').startsWith(`${base}/`)),
        asked.join('\n'),
      )
      assert.equal(asked.filter((one) => one === `${base}/_t/health`).length, 1, asked.join('\n'))
      assert.ok(asked.includes(`${base}/_t/s/notes/first.json`), asked.join('\n'))
      assert.equal(asked.filter((one) => one.startsWith('document ')).length, 1, asked.join('\n'))
      assert.deepEqual(said, [])
    })
  })
}

test('[32-13] with the engine behind the same address, a form on an exported page calls it, a query on it is live, and after a new version the page follows it', async () => {
  const { app, dataFolder, address } = await served('exported')
  const folder = join(dataFolder, 'behind')
  const host = await hostOf(folder, base, Number(new URL(address).port))
  await app.export(folder, { origin: host, base })
  await inBrowser('chromium', async (page) => {
    const said = complaintsOf(page)
    const sockets: string[] = []
    page.on('websocket', (socket) => sockets.push(new URL(socket.url()).pathname))
    await alive(page, `${host}${base}/add`)
    await page.locator('[id="slug"]').fill('third')
    await page.locator('[id="body"]').fill('The third note')
    await page.locator('[id="send"]').click()
    await page.getByText('The third note').waitFor()
    // A write that the page did not make arrives over the live connection.
    await app.call('addNote', { slug: 'fourth', body: 'The fourth note' }, { as: { kind: 'nobody' } })
    await page.getByText('The fourth note').waitFor()
    assert.ok(sockets.includes(`${base}/_t/live`), sockets.join('\n'))
    // A new version runs: the first call of the page is answered T0007, and the page follows the running version.
    const version = await app.add(await closedAbout())
    await app.switch(version)
    await page.locator('[id="slug"]').fill('fifth')
    await page.locator('[id="body"]').fill('The fifth note')
    await page.locator('[id="send"]').click()
    await page.getByText('The fifth note').waitFor()
    const rows = Object(await app.read({ from: 'notes', where: { col: 'slug', is: 'fifth' } }, { as: 'system' }))
    assert.equal(rows.length, 1)
    assert.deepEqual(said, [])
  })
})

test('[32-13] on an exported page a move to an address with no file under _t/s/ loads the address whole, which the host answers with a page of its own', async () => {
  const { app, dataFolder } = await served('exported', {
    change: (folder) => {
      const file = join(folder, 'screens.tsx')
      const written = readFileSync(file, 'utf8')
      writeFileSync(
        file,
        written.replace("path: '/about',\n  access: 'anyone'", "path: '/about',\n  access: 'signedIn'"),
      )
    },
  })
  const folder = join(dataFolder, 'plain-unknown')
  const host = await hostOf(folder, base)
  await app.export(folder, { origin: host, base })
  assert.ok(!existsSync(join(folder, '_t', 's', 'about.json')))
  await inBrowser('chromium', async (page) => {
    const asked: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      asked.push(request.isNavigationRequest() ? `document ${url.pathname}` : url.pathname)
    })
    await alive(page, `${host}${base}/`)
    await page.locator('[id="about"]').click()
    await page.waitForURL(`${host}${base}/about`)
    await page.waitForFunction(() => !document.querySelector('#tent'))
    assert.ok(asked.includes(`${base}/_t/s/about.json`), asked.join('\n'))
    assert.ok(asked.includes(`document ${base}/about`), asked.join('\n'))
  })
})

test('[32-13] [31-8] an exported page, once alive, takes the states of the device that its cookie holds: on the page that set one, and on the next page it loads whole', async () => {
  const { app, dataFolder } = await served('exported', {
    change: (folder) => {
      const project = join(folder, 'tent.ts')
      writeFileSync(
        project,
        readFileSync(project, 'utf8')
          .replace("import { project } from 'tentjs'", "import { boolean, project } from 'tentjs'")
          .replace("title: 'Shop',", "title: 'Shop',\n  state: { dark: { type: boolean(), in: 'device' } },"),
      )
      const screens = join(folder, 'screens.tsx')
      writeFileSync(
        screens,
        readFileSync(screens, 'utf8').replace(
          'view: () => <h1>About the notes</h1>,',
          'view: ({ state }) => <main><h1>About the notes</h1><p id="dark">dark {String(state.dark)}</p><Link id="darken" set={{ dark: true }}>Dark</Link></main>,',
        ),
      )
    },
  })
  const folder = join(dataFolder, 'plain-device')
  const host = await hostOf(folder, base)
  await app.export(folder, { origin: host, base })
  await inBrowser('chromium', async (page) => {
    const said = complaintsOf(page)
    await alive(page, `${host}${base}/about`)
    await page.getByText('dark false', { exact: true }).waitFor()
    await page.locator('[id="darken"]').click()
    await page.getByText('dark true', { exact: true }).waitFor()
    // The next page is loaded whole: its file was written with the default, and the cookie holds the choice.
    await alive(page, `${host}${base}/about`)
    await page.getByText('dark true', { exact: true }).waitFor()
    assert.deepEqual(said, [])
  })
})

test('[32-13] [05-9.15] an entry of the list of an earlier export that names a folder fails nothing, and the folder stays', async () => {
  const { app, dataFolder } = await notes()
  const folder = join(dataFolder, 'listed-folder')
  await app.export(folder, { origin })
  // The list of the export before names a folder of its own, as a hand that wrote it might.
  const list = join(folder, '_t', 'export.json')
  const written = JSON.parse(readFileSync(list, 'utf8'))
  writeFileSync(list, JSON.stringify({ ...written, files: [...written.files, 'kept', 'notes'] }))
  cpSync(join(folder, 'notes'), join(folder, 'kept'), { recursive: true })
  await app.export(folder, { origin })
  assert.ok(existsSync(join(folder, 'kept')))
  assert.ok(existsSync(join(folder, 'notes', 'first', 'index.html')))
})
