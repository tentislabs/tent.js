import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import type { LiveServed } from './living.ts'
import { servedLive, signedInLive, untilTried } from './living.ts'
import { sessionIn } from './sessionIn.ts'

const system = { kind: 'system' } as const

/** Opens an address of the app, and waits until the page has come alive: from then on a press is taken. */
async function alive(page: Page, address: string): Promise<void> {
  await page.goto(address)
  await page.locator('#tent[data-t-alive]').waitFor()
}

/** Waits for the heading of the page to count so many cards. */
const counted = (page: Page, n: number, what = 'cards') =>
  page.getByRole('heading', { name: `${n} ${what}`, exact: true }).waitFor()

/** How many cards the app holds now. */
const held = async (at: LiveServed): Promise<number> => Number(await at.app.call('countCards', {}, { as: system }))

/** Counts the requests of a page that read a query through the door. */
function reads(page: Page): () => number {
  let count = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/_t/read/')) count += 1
  })
  return () => count
}

/**
 * Answers whether the page asked for its watches over its live connection yet. A page is alive before that
 * connection opens: a call it makes in between is followed by a request for its queries, as a page with no
 * connection does. The answers it already holds are sent again only where they change.
 */
function heard(page: Page): () => boolean {
  let one = false
  page.on('websocket', (socket) =>
    socket.on('framesent', () => {
      one = true
    }),
  )
  return () => one
}

/** Waits until each page asked for its watches over its live connection, for at most fifteen seconds. */
async function connected(...pages: (() => boolean)[]): Promise<void> {
  const ends = performance.now() + 15_000
  while (!pages.every((one) => one())) {
    assert.ok(performance.now() < ends, 'a page never asked for its watches over its live connection')
    await new Promise((done) => setTimeout(done, 50))
  }
}

test('[31-11] a change called from a form updates every open page that watches a query it touched, and no page asks for it by a request', async (t) => {
  const at = await servedLive(t)
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      const before = await held(at)
      const other = await page.context().newPage()
      const [mine, theirs] = [reads(page), reads(other)]
      const live = [heard(page), heard(other)]
      await alive(page, `${at.origin}/`)
      await alive(other, `${at.origin}/`)
      await counted(page, before)
      await counted(other, before)
      await connected(...live)
      // One page presses: its own list grows, and so does the list of the other page, which did nothing.
      await page.getByRole('button', { name: 'Add one' }).click()
      await counted(page, before + 1)
      await counted(other, before + 1)
      await other.getByText('Pressed', { exact: true }).first().waitFor()
      // A change from elsewhere reaches both.
      await at.app.call('addCard', { title: `From the system, ${engine}`, rank: 1 }, { as: system })
      await counted(page, before + 2)
      await counted(other, before + 2)
      await page.getByText(`From the system, ${engine}`, { exact: true }).waitFor()
      await other.getByText(`From the system, ${engine}`, { exact: true }).waitFor()
      // Neither page read the query through the door: the connection brought every change.
      assert.deepEqual([mine(), theirs()], [0, 0], said)
    })
})

test('[31-11] with the connection blocked the page still shows its own change, and a query that is never live is asked again after a call that worked', async (t) => {
  const at = await servedLive(t)
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      const before = await held(at)
      // No live connection can be opened: each is closed before it carries anything.
      await page.routeWebSocket(/\/_t\/live/, (socket) => socket.close())
      const mine = reads(page)
      await alive(page, `${at.origin}/`)
      await counted(page, before)
      await page.getByRole('button', { name: 'Add one' }).click()
      await counted(page, before + 1)
      assert.ok(mine() >= 1, `${said}: the page asked for its list again by a request`)

      // A list that states `live: false` is watched by no page, and is read again after the page's own call.
      const quiet = await page.context().newPage()
      const asked = reads(quiet)
      const sockets: string[] = []
      quiet.on('websocket', (socket) => void sockets.push(socket.url()))
      await alive(quiet, `${at.origin}/quiet`)
      await counted(quiet, before + 1, 'quiet cards')
      await quiet.getByRole('button', { name: 'Add quietly' }).click()
      await counted(quiet, before + 2, 'quiet cards')
      assert.equal(asked(), 1, said)
      assert.deepEqual(sockets, [], `${said}: a page that shows no live query opens no connection`)
    })
})

test('[31-11] a page whose network changes misses no update: what was written while it was cut off is on the page once it is back', async (t) => {
  const at = await servedLive(t)
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const before = await held(at)
      // The connection of the page is carried by the test, which cuts it and lets the next one through.
      let cut: (() => void) | undefined
      let opened = 0
      await page.routeWebSocket(/\/_t\/live/, (socket) => {
        opened += 1
        const server = socket.connectToServer()
        cut = () => {
          server.close()
          socket.close()
        }
      })
      await alive(page, `${at.origin}/`)
      await counted(page, before)
      await untilTried('the page opened its connection', () => opened === 1)
      cut?.()
      await at.app.call('addCard', { title: `Missed in ${engine}`, rank: 2 }, { as: system })
      // The page comes back by itself, and shows what it missed.
      await counted(page, before + 1)
      await page.getByText(`Missed in ${engine}`, { exact: true }).waitFor()
      assert.equal(opened, 2, `in ${engine}`)
    })
})

test('[31-11] useCall with expect shows its result at once, keeps it when the call worked, and drops it when the call fails', async (t) => {
  const at = await servedLive(t)
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      const card = String(
        Reflect.get(
          Object(await at.app.call('addCard', { title: `Guessed ${engine}`, rank: 3 }, { as: system })),
          'id',
        ),
      )
      const before = await held(at)
      await alive(page, `${at.origin}/optimistic`)
      await counted(page, before)
      // The call that fails is held back: while it is under way the page shows the optimistic result, one card fewer.
      let free: (() => void) | undefined
      const waits = new Promise<void>((done) => {
        free = done
      })
      await page.route('**/_t/call/keepCard', async (route) => {
        await waits
        await route.continue()
      })
      await page.evaluate((id) => void Reflect.get(window, 'keepCard')({ card: id }).catch(() => undefined), card)
      await counted(page, before - 1)
      assert.equal(await page.getByText(`Guessed ${engine}`, { exact: true }).count(), 0, said)
      // The call fails: the optimistic result is dropped at once, and the error of the call is read.
      free?.()
      await counted(page, before)
      await page.getByText('kept', { exact: true }).waitFor()
      assert.equal(await page.getByText(`Guessed ${engine}`, { exact: true }).count(), 1, said)

      // The call that works: the optimistic result is shown while it is held back, and the answer of the engine keeps it so.
      let go: (() => void) | undefined
      const held_ = new Promise<void>((done) => {
        go = done
      })
      await page.route('**/_t/call/dropCard', async (route) => {
        await held_
        await route.continue()
      })
      await page.evaluate((id) => void Reflect.get(window, 'dropCard')({ card: id }), card)
      await counted(page, before - 1)
      assert.equal(await held(at), before, `${said}: the engine has not carried the call out yet`)
      go?.()
      await page.waitForResponse('**/_t/call/dropCard')
      await counted(page, before - 1)
      assert.equal(await held(at), before - 1, said)
    })
})

test('[31-13@6] a watch of a browser that a session the test made signed in fails when the user loses a role: the page asks for its screen again, and shows that it is not found', async (t) => {
  const at = await servedLive(t)
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      const { user, cookie } = await signedInLive(at, `Ada of ${engine}`, ['staff'])
      const cards = await held(at)
      // The session makes the browser that user, and the screen of the staff is drawn with what only the staff reads.
      await sessionIn(page, at.origin, cookie)
      await alive(page, `${at.origin}/staff`)
      await counted(page, cards, 'for the staff')
      // The role is taken away. The watch stands until its group is run: the next write to what it reads.
      await at.app.call('setRoles', { user, roles: [] }, { as: system })
      await at.app.call('addCard', { title: `After the role, ${engine}`, rank: 4 }, { as: system })
      await page.getByRole('heading', { name: 'This page could not be found.' }).waitFor()
      assert.equal(await page.getByText('for the staff').count(), 0, said)
      // The address stayed, and a request for it is not found either.
      assert.equal(new URL(page.url()).pathname, '/staff', said)
      const again = await page.goto(`${at.origin}/staff`)
      assert.equal(again?.status(), 404, said)
    })
})
