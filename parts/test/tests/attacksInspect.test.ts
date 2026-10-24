import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test, { after } from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { buildProject } from '../../build/index.ts'
import { TentError } from '../../core/index.ts'
import type { App, Engine } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import type { InspectedSite } from './inspectSites.ts'
import { siteStarted } from './inspectSites.ts'
import type { Served } from './served.ts'
import { served } from './served.ts'

// Three screens beside those of the project of the inspect mode: one that needs a signed-in caller, one that is
// kept by the cache, and one that another origin may frame.
const more = `import { screen } from 'tentjs/ui'

export const privateScreen = screen('privateScreen', {
  path: '/private',
  access: 'signedIn',
  view: () => (
    <div id="private">
      <span id="privateText">Private</span>
    </div>
  ),
})

export const cachedScreen = screen('cachedScreen', {
  path: '/cached',
  access: 'anyone',
  cache: { for: '1 minute', public: true },
  view: () => (
    <div id="cached">
      <span id="cachedText">Kept</span>
    </div>
  ),
})

export const wideScreen = screen('wideScreen', {
  path: '/wide',
  access: 'anyone',
  framedBy: ['https://studio.example.com'],
  view: () => (
    <div id="wide">
      <span id="wideText">Wide</span>
    </div>
  ),
})
`

const withMore = (folder: string): void => writeFileSync(join(folder, 'attacked.tsx'), more)

let common: Promise<{ app: Served; tool: InspectedSite; evil: InspectedSite }> | undefined
const project = (): Promise<{ app: Served; tool: InspectedSite; evil: InspectedSite }> => {
  common ??= (async () => ({
    app: await served('inspected', { for: 'dev', change: withMore }),
    tool: await siteStarted(),
    evil: await siteStarted(),
  }))()
  return common
}

// The engine of two apps that a test of this file opened, and its folder: each is closed and removed at its end.
const engines: Engine[] = []
const folders: string[] = []
after(async () => {
  for (const engine of engines) await engine.close()
  for (const folder of folders) rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

/** Two apps of the project of the inspect mode in one engine, each under a name of its own. */
async function twoApps(): Promise<[App, App]> {
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  const work = mkdtempSync(join(all, 'inspectTwo-'))
  folders.push(work)
  const engine = createEngine({ port: 0 })
  engines.push(engine)
  const apps: App[] = []
  for (const name of ['inspected', 'inspectedTwo']) {
    const folder = join(work, name)
    cpSync(join(import.meta.dirname, 'inspected'), folder, { recursive: true })
    const tent = join(folder, 'tent.ts')
    writeFileSync(tent, readFileSync(tent, 'utf8').replaceAll('inspected', name))
    const made = await buildProject(folder, { for: 'dev' })
    assert.deepEqual(made.findings, [])
    apps.push(
      await engine.open(made.bundleFolder, {
        dataFolder: join(work, `${name}-data`),
        mode: 'test',
        address: `${name.toLowerCase()}.test`,
      }),
    )
  }
  const [one, two] = apps
  assert.ok(one && two)
  return [one, two]
}

const policyOf = (answer: Response): string => answer.headers.get('content-security-policy') ?? ''

/** The file of the part `inspect` of the page code, as the description of the app names it. */
const partFileOf = (app: Served): string =>
  String(Reflect.get(Object(Reflect.get(Object(Object(app.description.browser).page), 'parts')), 'inspect') ?? '')

/** Holds that an answer is in no inspect mode: it may not be framed, and loads nothing of the mode. */
async function notInMode(answer: Response, part: string, said: string): Promise<void> {
  assert.match(policyOf(answer), /frame-ancestors 'none'/, said)
  const html = await answer.text()
  assert.doesNotMatch(html, /"inspect":\{/, said)
  assert.ok(part !== '' && !html.includes(part), `${said}: the part is not named`)
}

/** Holds that an answer is in the inspect mode of a tool of an origin. */
async function inMode(answer: Response, origin: string, said: string): Promise<void> {
  assert.ok(policyOf(answer).includes(`frame-ancestors ${origin}`), `${said}: ${policyOf(answer)}`)
  assert.ok((await answer.text()).includes(`"inspect":{"origin":"${origin}"}`), said)
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

test('[34-3.7] app.inspect with a framedBy that holds a space, a semicolon, a path, a star or null is T0002', async () => {
  const { app } = await project()
  for (const framedBy of [
    'http://127.0.0.1:4000 http://evil.example',
    'http://127.0.0.1:4000;script-src',
    'https://studio.example.com;sandbox',
    'https://studio.example.com/tool',
    'https://*.example.com',
    '*',
    "https://studio.example.com'",
    null,
  ])
    assert.throws(
      // A program may hand anything: it is handed as it is, past the types of the word.
      () => Reflect.apply(app.app.inspect, app.app, [{ framedBy }]),
      (error: unknown) => error instanceof TentError && error.code === 'T0002',
      String(framedBy),
    )
})

test('[34-3.1] a page asked for with no token, a token of another engine, of another app of this engine, one after its end, and one changed by a letter loads no part and may not be framed', async () => {
  const { app, tool } = await project()
  const part = partFileOf(app)
  const good = app.app.inspect({ framedBy: tool.origin })
  const other = (await served('inspected', { for: 'dev' })).app.inspect({ framedBy: tool.origin })
  const [one, two] = await twoApps()
  const ofOne = one.inspect({ framedBy: tool.origin })
  const changed = `${good.slice(0, 5)}${good[5] === 'a' ? 'b' : 'a'}${good.slice(6)}`
  for (const [token, said] of [
    ['', 'no token'],
    [other, 'a token of another engine'],
    [changed, 'a token changed by a letter'],
  ] as const)
    await notInMode(await fetch(`${app.address}/${token ? `?t-inspect=${token}` : ''}`), part, said)
  // A token of one app of an engine opens a page of that app, and nothing of the other.
  const onOne = await one.request(new Request(`http://inspected.test/?t-inspect=${ofOne}`))
  await inMode(onOne, tool.origin, 'its own app')
  const onTwo = await two.request(new Request(`http://inspectedtwo.test/?t-inspect=${ofOne}`))
  assert.match(policyOf(onTwo), /frame-ancestors 'none'/, 'a token of another app of this engine')
  assert.doesNotMatch(await onTwo.text(), /"inspect":\{/)
  // A token whose end has come opens nothing.
  const short = app.app.inspect({ framedBy: tool.origin, for: '1 second' })
  await inMode(await fetch(`${app.address}/?t-inspect=${short}`), tool.origin, 'before its end')
  await sleep(1500)
  await notInMode(await fetch(`${app.address}/?t-inspect=${short}`), part, 'a token after its end')
})

/** A frame of a page of the browser. */
type AppFrame = ReturnType<Page['mainFrame']>

/** The frame of the app in a page of a site that frames it. */
async function appFrame(page: Page): Promise<AppFrame> {
  const frame = await (await page.$('#app'))?.contentFrame()
  assert.ok(frame, 'the site holds the frame of the app')
  return frame
}

/** Whether the frame of the app shows the page of the app, once the frame has loaded. */
async function shown(page: Page): Promise<boolean> {
  await page.waitForFunction(() => Reflect.get(window, 'loaded') === true, undefined, { timeout: 60_000 })
  // A browser that refused the page may never give the frame a document to look into: that frame shows nothing.
  try {
    const looked = (await appFrame(page)).evaluate(() => document.querySelector('body > div#tent') !== null)
    return await Promise.race([looked, sleep(10_000).then(() => false)])
  } catch {
    return false
  }
}

/** What reached the page of a site so far: each message with the origin it came from. */
const gotOf = (page: Page): Promise<{ origin: string; data: Record<string, unknown> }[]> =>
  page.evaluate(() => Reflect.get(window, 'got'))

/** Waits until the page of a site was posted a message of the app that holds, and answers it. */
async function heard(page: Page, from: string, holds: (data: Record<string, unknown>) => boolean, after = 0) {
  for (let n = 0; n < 3000; n++) {
    const found = (await gotOf(page)).slice(after).find((one) => one.origin === from && holds(one.data))
    if (found) return found.data
    await sleep(10)
  }
  return assert.fail(`never heard; the site was posted ${JSON.stringify((await gotOf(page)).slice(after))}`)
}

/** Opens a site that frames an address of the app, and waits until the page in the frame is ready. */
async function framedReady(page: Page, site: InspectedSite, address: string, app: string): Promise<void> {
  await page.goto(`${site.origin}/frame?src=${encodeURIComponent(address)}`)
  await heard(page, app, (data) => data.t === 'tent.ready')
}

/** Asks the page in the frame for its tree, and waits for its answer: so every message before it was taken. */
async function treeAsked(page: Page, app: string): Promise<Record<string, unknown>> {
  const from = (await gotOf(page)).length
  await page.evaluate(() => Reflect.apply(Reflect.get(window, 'send'), window, [{ t: 'tent.tree' }]))
  return heard(page, app, (data) => data.t === 'tent.tree', from)
}

for (const engine of browserEngines)
  test(`[34-3.1] [34-3.2] a page with a token that does not hold, and one with a good token framed by another origin than the one it names, is not shown in the frame, in ${engine}`, async () => {
    const { app, tool, evil } = await project()
    const good = app.app.inspect({ framedBy: tool.origin })
    const changed = `${good.slice(0, 5)}${good[5] === 'a' ? 'b' : 'a'}${good.slice(6)}`
    await inBrowser(engine, async (page) => {
      // The site of the tool shows the page with the good token: so a frame that shows nothing shows nothing for its token.
      await page.goto(`${tool.origin}/frame?src=${encodeURIComponent(`${app.address}/?t-inspect=${good}`)}`)
      assert.equal(await shown(page), true, 'the good token')
      for (const token of ['', changed]) {
        await page.goto(`${tool.origin}/frame?src=${encodeURIComponent(`${app.address}/?t-inspect=${token}`)}`)
        assert.equal(await shown(page), false, `the token ${token || 'none'}`)
      }
      await page.goto(`${evil.origin}/frame?src=${encodeURIComponent(`${app.address}/?t-inspect=${good}`)}`)
      assert.equal(await shown(page), false, 'framed by another origin')
    })
  })

for (const engine of browserEngines)
  test(`[34-3.3] a message to the page from a frame of another origin and from a frame inside the page is not read, in ${engine}`, async () => {
    const { app, tool, evil } = await project()
    const token = app.app.inspect({ framedBy: tool.origin })
    await inBrowser(engine, async (page) => {
      const address = `${app.address}/?t-inspect=${token}`
      await page.goto(`${tool.origin}/frame?src=${encodeURIComponent(address)}&evil=${encodeURIComponent(evil.origin)}`)
      await heard(page, app.address, (data) => data.t === 'tent.ready')
      // A frame of another origin beside it posts to the page: picking on, and a tree asked for.
      const from = (await gotOf(page)).length
      for (const message of [{ t: 'tent.pick', on: true }, { t: 'tent.tree' }]) {
        await page.evaluate((one) => Reflect.apply(Reflect.get(window, 'goEvil'), window, [one]), message)
        await heard(page, evil.origin, (data) => data.t === 'evil.posted', from)
      }
      // A frame inside the page posts to it.
      const inner = await (await appFrame(page)).evaluate(() => {
        const made = document.createElement('iframe')
        made.id = 'inner'
        document.body.append(made)
        return true
      })
      assert.ok(inner)
      const child = (await appFrame(page)).childFrames()[0]
      assert.ok(child, 'the frame inside the page')
      await child.evaluate(() => parent.postMessage({ t: 'tent.tree' }, '*'))
      await child.evaluate(() => parent.postMessage({ t: 'tent.pick', on: true }, '*'))
      await treeAsked(page, app.address)
      const trees = (await gotOf(page)).slice(from).filter((one) => one.data.t === 'tent.tree')
      assert.equal(trees.length, 1, 'only the tool is answered')
      // Picking stayed off: a press still calls.
      const before = Number(await app.app.call('pressCount', {}, { as: { kind: 'system' } }))
      await (await appFrame(page)).locator('button[id="press"]').click()
      await (await appFrame(page)).getByText(`${before + 1} presses`, { exact: true }).waitFor()
    })
  })

for (const engine of browserEngines)
  test(`[34-3.3] a page of the mode for 'opener', whose opener has gone to another site, posts nothing to that site and reads nothing from it, in ${engine}`, async () => {
    const { app, tool, evil } = await project()
    const token = app.app.inspect({ framedBy: { opener: tool.origin } })
    await inBrowser(engine, async (page) => {
      await page.goto(`${tool.origin}/open?src=${encodeURIComponent(`${app.address}/?t-inspect=${token}`)}`)
      const [opened] = await Promise.all([
        page.waitForEvent('popup'),
        page.evaluate(() => Reflect.apply(Reflect.get(window, 'openApp'), window, [])),
      ])
      await heard(page, app.address, (data) => data.t === 'tent.ready')
      // The window of the tool goes to another site; the page it opened stays, and its pointer moves.
      await page.goto(`${evil.origin}/listen`)
      await opened.locator('#tent[data-t-alive]').waitFor()
      for (const id of ['title', 'left', 'count', 'press']) {
        const box = await opened.locator(`[id="${id}"]`).first().boundingBox()
        if (box) await opened.mouse.move(box.x + 2, box.y + 2)
      }
      await sleep(2000)
      const got = (await gotOf(page)).filter((one) => one.origin === app.address)
      assert.deepEqual(
        got.map((one) => one.data.t),
        [],
        'the page told the other site of its elements, and answered it the tree',
      )
    })
  })

for (const engine of browserEngines)
  test(`[34-3.4] the token is not in the address once the page lives, nor in what the browser tells another site, in ${engine}`, async () => {
    const { app, tool, evil } = await project()
    const token = app.app.inspect({ framedBy: tool.origin })
    await inBrowser(engine, async (page) => {
      await framedReady(page, tool, `${app.address}/?t-inspect=${token}`, app.address)
      const frame = await appFrame(page)
      assert.ok(!frame.url().includes(token), frame.url())
      assert.ok(!(await frame.evaluate(() => window.location.href)).includes(token))
      // The page goes to a page of another site: what it is told of where the visitor came from holds no token.
      await frame.evaluate((to) => {
        window.location.href = to
      }, `${evil.origin}/seen`)
      for (let n = 0; n < 3000 && !evil.asked.some((one) => one.path === '/seen'); n++) await sleep(10)
      const seen = evil.asked.filter((one) => one.path === '/seen')
      assert.ok(seen.length > 0, 'the other site was asked')
      for (const one of seen) assert.ok(!one.referer.includes(token), one.referer)
    })
  })

test('[34-3.4] the token is not in the back of a sign-in, and the way there carries it as a name of its own', async () => {
  const { app, tool } = await project()
  const token = app.app.inspect({ framedBy: tool.origin })
  const answer = await fetch(`${app.address}/private?tab=one&t-inspect=${token}`, { redirect: 'manual' })
  assert.equal(answer.status, 302)
  const to = new URL(answer.headers.get('location') ?? '', app.address)
  assert.equal(to.searchParams.get('t-inspect'), token)
  const back = to.searchParams.get('back') ?? ''
  assert.ok(back.startsWith('/private'), back)
  assert.ok(!back.includes(token) && !back.includes('t-inspect'), back)
  assert.equal(
    answer.headers.get('referrer-policy') ?? 'strict-origin-when-cross-origin',
    'strict-origin-when-cross-origin',
  )
})

for (const engine of browserEngines)
  test(`[34-3.5] [34-3.6] tent.goTo to another site or out of the app moves nothing, and tent.highlight with a color, a place or uses of another form sets nothing, in ${engine}`, async () => {
    const { app, tool } = await project()
    const token = app.app.inspect({ framedBy: tool.origin })
    await inBrowser(engine, async (page) => {
      await framedReady(page, tool, `${app.address}/?t-inspect=${token}`, app.address)
      const send = (message: object): Promise<void> =>
        page.evaluate((one) => Reflect.apply(Reflect.get(window, 'send'), window, [one]), message)
      const readies = async (): Promise<number> =>
        (await gotOf(page)).filter((one) => one.origin === app.address && one.data.t === 'tent.ready').length
      const before = await readies()
      for (const path of [
        '//evil.example',
        '//evil.example/x',
        'https://evil.example/',
        'javascript:alert(1)',
        '/\\evil.example',
        '/%2F%2Fevil.example',
        '/_t/admin/run',
        '/_t/b/description.json',
        'list',
      ])
        await send({ t: 'tent.goTo', path })
      await treeAsked(page, app.address)
      assert.equal(await readies(), before, 'no move')
      assert.equal(new URL((await appFrame(page)).url()).pathname, '/')
      // The place of an element that is drawn, as the page tells it.
      const tree = await treeAsked(page, app.address)
      const place: unknown = Object(Array.isArray(tree.elements) ? tree.elements[0] : undefined).place
      assert.ok(place, 'the tree holds an element')
      for (const message of [
        { t: 'tent.highlight', place, color: 'red; background: url(http://evil.example/x)' },
        { t: 'tent.highlight', place, color: 'red;outline-width:40px' },
        { t: 'tent.highlight', place, color: 'url(http://evil.example/x)' },
        { t: 'tent.highlight', place, uses: ['board.tsx"]'], color: 'red' },
        { t: 'tent.highlight', place: 'boardScreen@0"]', color: 'red' },
        { t: 'tent.highlight', place: { ...Object(place), from: '0"]' }, color: 'red' },
        { t: 'tent.highlight', place: { file: 'board.tsx"]', from: 0, to: 10 }, color: 'red' },
        { t: 'tent.highlight', place: { file: '../board.tsx', from: 0, to: 10 }, color: 'red' },
      ]) {
        // Each is held alone: a later order that finds no element would take away a frame that an earlier one drew.
        await send(message)
        await treeAsked(page, app.address)
        const frames = await (await appFrame(page)).evaluate(
          () => document.querySelectorAll('[data-t-highlight]').length,
        )
        assert.equal(frames, 0, `nothing is set for ${JSON.stringify(message)}`)
      }
      // The same order in its own form draws the frame: the page took the orders above, and set nothing for them.
      await send({ t: 'tent.highlight', place, color: 'red' })
      await (await appFrame(page)).locator('[data-t-highlight]').waitFor()
    })
  })

test('[34-3.8] a public screen with a cache, asked for with a good token and by a visitor with none, in both orders', async () => {
  const { app, tool } = await project()
  const part = partFileOf(app)
  // In development the cache keeps nothing: the app of this test is a release build in the mode `test`.
  const release = await served('inspected', { for: 'release', change: withMore })
  const releasePart = partFileOf(release)
  assert.ok(part !== '' && releasePart !== '')
  const token = (): string => release.app.inspect({ framedBy: tool.origin })
  await inMode(await fetch(`${release.address}/cached?t-inspect=${token()}`), tool.origin, 'the first with a token')
  await notInMode(await fetch(`${release.address}/cached`), releasePart, 'a visitor with none after it')
  await notInMode(await fetch(`${release.address}/cached`), releasePart, 'a visitor with none, from the cache')
  const after = await fetch(`${release.address}/cached?t-inspect=${token()}`)
  assert.ok(!(after.headers.get('cache-control') ?? '').includes('public'), 'a page in the mode is kept by no cache')
  await inMode(after, tool.origin, 'a token after the cache holds the page')
})

for (const engine of browserEngines)
  test(`[34-3.9] a page in the mode that is loaded whole by a move to a screen of another framedBy keeps the mode, in ${engine}`, async () => {
    const { app, tool } = await project()
    const token = app.app.inspect({ framedBy: tool.origin })
    await inBrowser(engine, async (page) => {
      await framedReady(page, tool, `${app.address}/?t-inspect=${token}`, app.address)
      const from = (await gotOf(page)).length
      await page.evaluate(() => Reflect.apply(Reflect.get(window, 'send'), window, [{ t: 'tent.goTo', path: '/wide' }]))
      await heard(page, app.address, (data) => data.t === 'tent.ready' && data.screen === 'wideScreen', from)
      assert.ok(!(await appFrame(page)).url().includes(token))
    })
  })

test('[34-3.9] a form sent with no script keeps the mode, where it is taken and where it fails', async () => {
  const { app, tool } = await project()
  const token = app.app.inspect({ framedBy: tool.origin })
  const html = await (await fetch(`${app.address}/form?t-inspect=${token}`)).text()
  const form = /<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/.exec(html)
  assert.ok(form, 'the page holds the form')
  const fields = new URLSearchParams()
  for (const [, tag] of form[2].matchAll(/<input([^>]*)>/g)) {
    const name = /name="([^"]*)"/.exec(tag)?.[1]
    if (name && /\bhidden\b/.test(tag))
      fields.set(name, /value="([^"]*)"/.exec(tag)?.[1]?.replaceAll('&amp;', '&') ?? '')
  }
  assert.equal(fields.get('t-inspect'), token)
  const sent = (body: URLSearchParams): Promise<Response> =>
    fetch(new URL(form[1].replaceAll('&amp;', '&'), app.address), {
      method: 'POST',
      body,
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: app.address },
    })
  const taken = new URLSearchParams(fields)
  taken.set('title', 'Sent with no script')
  const answer = await sent(taken)
  assert.equal(answer.status, 303)
  const location = answer.headers.get('location') ?? ''
  assert.ok(location.includes(`t-inspect=${token}`), location)
  await inMode(await fetch(new URL(location, app.address)), tool.origin, 'the page the form leads to')
  // A form that fails is drawn again in the mode.
  const failed = await sent(new URLSearchParams(fields))
  assert.notEqual(failed.status, 303)
  await inMode(failed, tool.origin, 'the form drawn again')
})
