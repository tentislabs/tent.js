import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import type { Place, ToldElement } from './inspecting.ts'
import { frameOf, messagesOf, toolOpened, postToFrame, toldElementOf, toolServer, waitFor } from './inspecting.ts'
import { siteStarted } from './inspectSites.ts'
import type { Served } from './served.ts'
import { alive, served } from './served.ts'

// The project is built for development and served once for the tests of this file, and once more as a release.
let dev: Promise<Served> | undefined
const developed = (): Promise<Served> => {
  dev ??= served('inspected', { for: 'dev' })
  return dev
}
let tool: Promise<string> | undefined
const toolNow = (): Promise<string> => {
  tool ??= toolServer()
  return tool
}

/** The text of a file of the project as the build counts its characters: with one line ending. */
const sourceOf = (file: string): string =>
  readFileSync(join(import.meta.dirname, 'inspected', file), 'utf8').replace(/\r\n?/g, '\n')

/** The tag that stands at a place of a file: its name, and the `data-at` that its opening tag carries. */
function tagAt(place: Place): { name: string; at?: string } {
  const text = sourceOf(place.file).slice(place.from, place.to + 1)
  const opening = text.slice(0, text.indexOf('>') + 1)
  return { name: /^<([A-Za-z][A-Za-z0-9]*)/.exec(text)?.[1] ?? '', at: /data-at="([A-Za-z]+)"/.exec(opening)?.[1] }
}

/** The address of a screen of the app with a good token for the tool. */
const tokened = (app: Served, path: string, origin: string): string =>
  `${app.address}${path}?t-inspect=${app.app.inspect({ framedBy: origin })}`

/** The file that the description places a view in. */
const fileOf = (app: Served, view: string): string =>
  String(Object(Reflect.get(Object(app.description.places), view)).file)

/** Draws numbers from a seed, so that the points of a test are the same on every run. */
function drawn(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
}

/** The newest element that the frame said the pointer is over, or nothing. */
async function newestOver(page: Page): Promise<ToldElement | undefined> {
  const over = (await messagesOf(page)).filter((one) => one.t === 'tent.over').at(-1)
  return over?.element === undefined ? undefined : toldElementOf(over.element)
}

/** What a point of the frame lies on, read from the `data-at` of the page and from nothing of the inspect mode. */
interface Pointed {
  at: string
  inBadge: boolean
  rect: { x: number; y: number; width: number; height: number }
}

const pointedAt = (page: Page, x: number, y: number): Promise<Pointed | undefined> =>
  frameOf(page).evaluate(
    ([x, y]) => {
      const marked = document.elementFromPoint(x, y)?.closest('[data-at]')
      if (!marked) return undefined
      const box = marked.getBoundingClientRect()
      return {
        at: marked.getAttribute('data-at') ?? '',
        inBadge: marked.closest('[data-at="badge"]') !== null,
        rect: { x: box.x, y: box.y, width: box.width, height: box.height },
      }
    },
    [x, y],
  )

/** Holds what the page told of an element against what it should tell of the element at that point. */
function holdsElement(app: Served, told: ToldElement, pointed: Pointed, screen: string, said: string): void {
  const view = pointed.inBadge ? 'Badge' : screen
  const tag = tagAt(told.place)
  assert.equal(told.view, view, `${said}: the view`)
  assert.equal(told.place.file, fileOf(app, view), `${said}: the file`)
  assert.equal(tag.at, pointed.at, `${said}: the tag`)
  assert.equal(told.tag, tag.name, `${said}: the name of the tag`)
  assert.deepEqual(
    told.uses.map((one) => [one.file, tagAt(one).name]),
    pointed.inBadge ? [[fileOf(app, screen), 'Badge']] : [],
    `${said}: the uses`,
  )
  for (const side of ['x', 'y', 'width', 'height'] as const)
    assert.ok(Math.abs(told.rect[side] - pointed.rect[side]) < 1, `${said}: the ${side} of where it lies`)
}

const screens = [
  ['boardScreen', '/'],
  ['listScreen', '/list'],
  ['formScreen', '/form'],
] as const

for (const engine of browserEngines)
  test(`[34-3] the inspect mode reports the right element for 100 random points on three sample screens of a development build, in ${engine}`, async () => {
    const app = await developed()
    const origin = await toolNow()
    const next = drawn(8)
    await inBrowser(engine, async (page) => {
      for (const [screen, path] of screens) {
        await toolOpened(page, origin, tokened(app, path, origin), screen)
        let held = 0
        for (let n = 0; n < 100; n++) {
          const [x, y] = [Math.floor(next() * 800), Math.floor(next() * 600)]
          const said = `${screen}, the point ${x},${y}, in ${engine}`
          await page.mouse.move(x, y)
          const pointed = await pointedAt(page, x, y)
          if (!pointed) continue
          // The page tells an element when the pointer comes over another: the newest it told is the one it is over.
          let told: ToldElement | undefined
          for (let k = 0; k < 500; k++) {
            told = await newestOver(page)
            if (
              told &&
              tagAt(told.place).at === pointed.at &&
              Math.abs(told.rect.y - pointed.rect.y) < 1 &&
              Math.abs(told.rect.x - pointed.rect.x) < 1
            )
              break
            await new Promise((done) => setTimeout(done, 10))
          }
          assert.ok(told, `${said}: the page told an element`)
          holdsElement(app, told, pointed, screen, said)
          held += 1
        }
        assert.ok(held > 20, `${screen}: the points lie on elements`)
      }
    })
  })

for (const engine of browserEngines)
  test(`[34-3] a page reports nothing without a good token: it loads no part of the inspect mode and may not be framed, in ${engine}`, async () => {
    const app = await developed()
    const origin = await toolNow()
    const good = app.app.inspect({ framedBy: origin })
    for (const token of ['', 'a'.repeat(32), `${good.slice(0, -1)}${good.at(-1) === 'a' ? 'b' : 'a'}`]) {
      const asked = await fetch(`${app.address}/${token ? `?t-inspect=${token}` : ''}`)
      const policy = asked.headers.get('content-security-policy') ?? ''
      assert.match(policy, /frame-ancestors 'none'/, `the token ${token || 'none'}`)
      assert.doesNotMatch(await asked.text(), /"inspect"/, `the token ${token || 'none'}`)
    }
    // A good one: the origin of the tool may frame the page, and the page record holds it.
    const asked = await fetch(`${app.address}/?t-inspect=${good}`)
    assert.match(
      asked.headers.get('content-security-policy') ?? '',
      new RegExp(`frame-ancestors ${origin.replace(/[.]/g, '\\.')}`),
    )
    assert.match(await asked.text(), new RegExp(`"inspect":\\{"origin":"${origin.replace(/[.]/g, '\\.')}"\\}`))
    await inBrowser(engine, async (page) => {
      const parts: string[] = []
      page.on('request', (request) => parts.push(request.url()))
      await alive(page, `${app.address}/?t-inspect=${'a'.repeat(32)}`)
      assert.deepEqual(
        parts.filter((one) => /page\.dev\.inspect\./.test(one)),
        [],
      )
    })
  })

for (const engine of browserEngines)
  test(`[34-3] while picking is on a press makes no call and picks the element, tent.highlight frames the element of a place, tent.tree answers every element that is drawn, and the mode is kept through a move, in ${engine}`, async () => {
    const app = await developed()
    const origin = await toolNow()
    await inBrowser(engine, async (page) => {
      const frame = (): ReturnType<typeof frameOf> => frameOf(page)
      await toolOpened(page, origin, tokened(app, '/', origin), 'boardScreen')
      const before = Number(await app.app.call('pressCount', {}, { as: { kind: 'system' } }))
      // A press while picking is on picks, and calls nothing.
      await postToFrame(page, { t: 'tent.pick', on: true })
      const box = await frame().locator('[data-at="press"]').boundingBox()
      assert.ok(box)
      const from = (await messagesOf(page)).length
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      const picked = toldElementOf(
        (await waitFor(page, 'the press is picked', (one) => one.t === 'tent.picked', from)).element,
      )
      assert.deepEqual([tagAt(picked.place).at, picked.view, picked.tag], ['press', 'boardScreen', 'button'])
      await postToFrame(page, { t: 'tent.pick', on: false })
      // The page takes the messages of its tool in their order: once it answers the next, picking is off.
      const off = (await messagesOf(page)).length
      await postToFrame(page, { t: 'tent.tree' })
      const tree = await waitFor(page, 'the answer after picking is off', (one) => one.t === 'tent.tree', off)
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await frame()
        .getByText(`${before + 1} presses`, { exact: true })
        .waitFor()
      assert.equal(Number(await app.app.call('pressCount', {}, { as: { kind: 'system' } })), before + 1)

      // The tree holds every element that is drawn, each with the elements inside it.
      const elements = (Array.isArray(tree.elements) ? tree.elements : []).map(toldElementOf)
      const flat: ToldElement[] = []
      const walk = (held: ToldElement[]): void => {
        for (const one of held) {
          flat.push(one)
          walk(one.elements ?? [])
        }
      }
      walk(elements)
      const marked = await frame().evaluate(() =>
        [...document.querySelectorAll('#tent [data-at]')].map((one) => one.getAttribute('data-at') ?? ''),
      )
      assert.deepEqual(flat.map((one) => tagAt(one.place).at ?? '').sort(), marked.sort())
      const [board] = elements
      assert.equal(board && tagAt(board.place).at, 'board')
      assert.ok(
        board?.elements?.some((one) => tagAt(one.place).at === 'title'),
        'the title is inside the board',
      )

      // A frame is drawn around the element of a place, in the color the tool gives, and taken away with none.
      const framed = async (): Promise<{ x: number; y: number; width: number; height: number; color: string }[]> =>
        frame().evaluate(() =>
          [...document.querySelectorAll('[data-t-highlight]')].map((one) => {
            const at = one.getBoundingClientRect()
            return { x: at.x, y: at.y, width: at.width, height: at.height, color: getComputedStyle(one).outlineColor }
          }),
        )
      const placeOf = (at: string): Place | undefined => flat.find((one) => tagAt(one.place).at === at)?.place
      await postToFrame(page, { t: 'tent.highlight', place: placeOf('left'), uses: [], color: '#ff0000' })
      await frame().locator('[data-t-highlight]').waitFor()
      const left = await frame().locator('[data-at="left"]').boundingBox()
      const [around] = await framed()
      assert.ok(left && around)
      for (const side of ['x', 'y', 'width', 'height'] as const)
        assert.ok(Math.abs(around[side] - left[side]) < 1, side)
      assert.equal(around.color, 'rgb(255, 0, 0)')
      await postToFrame(page, { t: 'tent.highlight', place: placeOf('title'), color: 'blue' })
      const title = await frame().locator('[data-at="title"]').boundingBox()
      for (let n = 0; n < 500; n++) {
        const [now] = await framed()
        if (now && title && Math.abs(now.y - title.y) < 1) break
        await new Promise((done) => setTimeout(done, 10))
      }
      const [onTitle] = await framed()
      assert.ok(onTitle && title && Math.abs(onTitle.y - title.y) < 1 && Math.abs(onTitle.height - title.height) < 1)
      await postToFrame(page, { t: 'tent.highlight' })
      await frame().locator('[data-t-highlight]').waitFor({ state: 'detached' })

      // A move inside the page keeps the mode: the page says it is ready on the next screen, and tells its elements.
      const moved = (await messagesOf(page)).length
      await frame().getByText('To the list', { exact: true }).click()
      await waitFor(page, 'the list is ready', (one) => one.t === 'tent.ready' && one.screen === 'listScreen', moved)
      // The move is shown through the browser's own transition between views: the pointer meets the screen once it ends.
      await frame().evaluate(() => Promise.all(document.getAnimations().map((one) => one.finished)))
      const heading = await frame().locator('[data-at="heading"]').boundingBox()
      assert.ok(heading)
      await page.mouse.move(heading.x + 4, heading.y + 4)
      await waitFor(
        page,
        'the heading is told',
        (one) =>
          one.t === 'tent.over' &&
          one.element !== undefined &&
          tagAt(toldElementOf(one.element).place).at === 'heading',
        moved,
      )
      // And so does a move that the tool asks for.
      const asked = (await messagesOf(page)).length
      await postToFrame(page, { t: 'tent.goTo', path: '/form' })
      const ready = await waitFor(page, 'the form is ready', (one) => one.t === 'tent.ready', asked)
      assert.deepEqual(
        [ready.screen, ready.path, ready.version],
        ['formScreen', '/form', app.app.versions().find((one) => one.running)?.id],
      )
    })
  })

for (const engine of browserEngines)
  test(`[34-3] a page opened by a tool for the token of its origin posts to that origin alone, and is told nothing more once the tool's window goes to another site, in ${engine}`, async () => {
    const app = await developed()
    const tool = await siteStarted()
    const evil = await siteStarted()
    const token = app.app.inspect({ framedBy: { opener: tool.origin } })
    // The page is no frame of the tool: its answer names no origin of a tool as one that may frame it.
    const asked = await fetch(`${app.address}/?t-inspect=${token}`)
    assert.match(asked.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/)
    await inBrowser(engine, async (page) => {
      await page.goto(`${tool.origin}/open?src=${encodeURIComponent(`${app.address}/?t-inspect=${token}`)}`)
      const [toolOpened] = await Promise.all([
        page.waitForEvent('popup'),
        page.evaluate(() => Reflect.apply(Reflect.get(window, 'openApp'), window, [])),
      ])
      const got = (): Promise<{ origin: string; data: Record<string, unknown> }[]> =>
        page.evaluate(() => Reflect.get(window, 'got'))
      for (let n = 0; n < 3000 && !(await got()).some((one) => one.data.t === 'tent.ready'); n++)
        await new Promise((done) => setTimeout(done, 10))
      const ready = (await got()).find((one) => one.data.t === 'tent.ready')
      assert.equal(ready?.origin, app.address, 'the tool is told that the page is ready')
      // The tool asks for the tree, and is answered.
      await page.evaluate(() => Reflect.get(window, 'opened').postMessage({ t: 'tent.tree' }, '*'))
      for (let n = 0; n < 3000 && !(await got()).some((one) => one.data.t === 'tent.tree'); n++)
        await new Promise((done) => setTimeout(done, 10))
      assert.ok(
        (await got()).some((one) => one.data.t === 'tent.tree'),
        'the tool is answered the tree',
      )
      // The window of the tool goes to another site, and the pointer moves over the page.
      await page.goto(`${evil.origin}/listen`)
      await toolOpened.locator('#tent[data-t-alive]').waitFor()
      for (const at of ['title', 'left', 'count', 'press']) {
        const box = await toolOpened.locator(`[data-at="${at}"]`).first().boundingBox()
        if (box) await toolOpened.mouse.move(box.x + 2, box.y + 2)
      }
      // What the page posts it posts as the pointer moves: a second is long past what a message takes.
      await new Promise((done) => setTimeout(done, 1000))
      assert.deepEqual(
        (await got()).filter((one) => one.origin === app.address).map((one) => one.data.t),
        [],
        'the other site was told of the elements',
      )
    })
  })

test('[34-3] the admin command inspect answers an address of this computer with a good token, for the tool of an origin', async () => {
  const app = await developed()
  const origin = await toolNow()
  const { token } = JSON.parse(readFileSync(join(app.dataFolder, 'engine.json'), 'utf8'))
  const answered = await fetch(`${app.address}/_t/admin/inspect`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ args: { framedBy: origin } }),
  })
  const body = await answered.json()
  assert.equal(body.ok, true, JSON.stringify(body))
  const address = String(Object(body.value).address)
  assert.match(address, /^http:\/\/localhost:\d+\/\?t-inspect=[A-Za-z0-9_-]{32}$/)
  const page = await fetch(address)
  assert.match(
    page.headers.get('content-security-policy') ?? '',
    new RegExp(`frame-ancestors ${origin.replace(/[.]/g, '\\.')}`),
  )
})

test('[34-3] a release build tells no element: the pointer over the page is told as over none, and the tree is empty', async () => {
  const app = await served('inspected', { for: 'release' })
  const origin = await toolNow()
  await inBrowser('chromium', async (page) => {
    await toolOpened(page, origin, tokened(app, '/', origin), 'boardScreen')
    const box = await frameOf(page).locator('[data-at="title"]').boundingBox()
    assert.ok(box)
    await page.mouse.move(box.x + 2, box.y + 2)
    const from = (await messagesOf(page)).length
    await postToFrame(page, { t: 'tent.tree' })
    const tree = await waitFor(page, 'the tree', (one) => one.t === 'tent.tree', from)
    assert.deepEqual(tree.elements, [])
    const over = (await messagesOf(page)).filter((one) => one.t === 'tent.over')
    assert.ok(
      over.every((one) => one.element === undefined),
      JSON.stringify(over),
    )
  })
})
