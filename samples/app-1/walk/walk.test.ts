import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import type { Browser, Locator, Page } from 'playwright-core'
import {
  APP_FOLDER,
  buildApp,
  copyApp,
  devApp,
  ensurePackages,
  type RunningApp,
  rowsOf,
  startApp,
  tempFolder,
  textOf,
  unlinkApp,
} from './app.ts'
import { ADA, alive, asked, contextOf, DANA, engineOf, GRACE, pictureOf, SAM, signedInAt, signIn } from './page.ts'

const MONEY = /^\$\d{1,3}(,\d{3})*\.\d{2}$/
const TURKISH_MONTH = /\b(Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara)\b/
const RECEIPT = join(APP_FOLDER, 'walk', 'receipt.pdf')

type Row = { id: string; email?: string; placedBy?: string; customer?: string; status?: string }

function asRow(value: unknown): Row {
  return { id: textOf(value, 'id'), ...Object(value) }
}

const main = (page: Page) => page.getByRole('main')
// The rows of the list of orders: each row that holds a link, which the row of the heads does not.
const orderRows = (page: Page) =>
  main(page)
    .getByRole('table')
    .getByRole('row')
    .filter({ has: page.getByRole('link') })
// What a row of the list shows: the name of the customer, the day, the status, and the total.
async function shown(row: Locator): Promise<{ name: string; day: string; total: string }> {
  const cells = await row.getByRole('cell').allInnerTexts()
  return {
    name: (await row.getByRole('link').innerText()).trim(),
    day: (cells[1] ?? '').trim(),
    total: (cells.at(-1) ?? '').trim(),
  }
}
const hrefOf = async (row: Locator) => (await row.getByRole('link').getAttribute('href')) ?? ''
// The words that describe a field to a screen reader, and where they stand on the page.
const described = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).evaluate((field) => {
    const ids = (field.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
    return ids.map((id) => {
      const words = field.ownerDocument.getElementById(id)
      return { words: words?.textContent ?? '', top: words?.getBoundingClientRect().top ?? 0 }
    })
  })
// A mark that only the page as it is holds: a reload takes it away.
const markPage = (page: Page) => page.evaluate(() => Object.assign(window, { walkMark: 'kept' }))
const pageKept = (page: Page) => page.evaluate(() => Reflect.get(window, 'walkMark') === 'kept')
const focused = (page: Page) =>
  page.evaluate(() => {
    const at = document.activeElement
    return { tag: at?.tagName ?? '', text: at?.textContent?.trim() ?? '', inList: Boolean(at?.closest('tbody')) }
  })

async function headingFocused(page: Page, where: string): Promise<void> {
  const landed = await page
    .waitForFunction(() => document.activeElement?.tagName === 'H1', undefined, { timeout: 5000 })
    .then(
      () => true,
      () => false,
    )
  assert.ok(landed, `the focus is on the heading of ${where}`)
}

for (const engine of asked) {
  const browserType = engineOf(engine)
  const pictures = join(APP_FOLDER, 'walk', 'pictures', engine)
  const picture = (page: Page, step: number) => pictureOf(page, join(pictures, `step-${step}.png`))
  // WebKit moves the focus to links only with the key Alt held, as Safari does on macOS.
  const tab = engine === 'webkit' ? 'Alt+Tab' : 'Tab'
  const backTab = engine === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab'

  describe(`the walk of sample app 1 on test data, in ${engine}`, () => {
    let temp: { path: string; remove: () => Promise<void> } | undefined
    let app: RunningApp | undefined
    let browser: Browser | undefined
    let page: Page
    let calls: string[] = []
    let adaPage: Page

    before(async () => {
      await mkdir(pictures, { recursive: true })
      await ensurePackages()
      temp = await tempFolder()
      const bundle = await buildApp(APP_FOLDER, join(temp.path, 'bundle'))
      app = await startApp(APP_FOLDER, bundle, join(temp.path, 'data'))
      browser = await browserType.launch()
      page = await (await contextOf(browser)).newPage()
      page.setDefaultTimeout(15_000)
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/_t/call/')) calls.push(request.url())
      })
      // The staff user Sam signs this browser in through the sign-in screen, which leads it to the orders.
      await signedInAt(page, app.address, SAM, '/orders')
    })

    after(async () => {
      await browser?.close()
      await app?.stop()
      await temp?.remove()
    })

    const running = (): RunningApp => {
      if (!app) throw new Error('The app did not start.')
      return app
    }
    const usable = (): Browser => {
      if (!browser) throw new Error('The browser did not start.')
      return browser
    }

    test(`[04-1.1] staff open /orders and see the eight open orders, each with a name and its total as money (${engine})`, async () => {
      assert.equal(new URL(page.url()).pathname, '/orders')
      await alive(page)
      await main(page).getByRole('heading', { level: 1, name: 'Orders' }).waitFor()
      assert.equal(await orderRows(page).count(), 8)
      for (const row of await orderRows(page).all()) {
        const { name, total } = await shown(row)
        assert.match(name, /^\S+ \S+$/, 'each order shows the name of its customer')
        assert.match(total, MONEY, 'each order shows its total as money')
      }
      const first = await shown(orderRows(page).first())
      assert.equal(first.name, 'Ada Lovelace')
      assert.equal(first.total, '$19.99')
      await picture(page, 1)
    })

    test(`[04-1.2] a new order, sent from "New order", stands first in the orders list (${engine})`, async () => {
      await main(page).getByRole('link', { name: 'New order' }).click()
      await page.waitForURL('**/orders/new')
      await main(page).getByRole('heading', { level: 1, name: 'New order' }).waitFor()
      await alive(page)
      await page.getByLabel('Customer', { exact: true }).selectOption({ label: 'Grace Hopper' })
      await page.getByLabel('Total', { exact: true }).fill('42.50')
      await page.getByRole('button', { name: 'Add order' }).click()
      await page.waitForURL('**/orders')
      await alive(page)
      await orderRows(page).nth(8).waitFor()
      assert.equal(await orderRows(page).count(), 9)
      const first = await shown(orderRows(page).first())
      assert.equal(first.name, 'Grace Hopper')
      assert.equal(first.total, '$42.50')
      await picture(page, 2)
    })

    test(`[04-1.3] the form sent with no total says "This is needed." under the total, and makes no call (${engine})`, async () => {
      await main(page).getByRole('link', { name: 'New order' }).click()
      await page.waitForURL('**/orders/new')
      await main(page).getByRole('heading', { level: 1, name: 'New order' }).waitFor()
      await alive(page)
      await page.getByLabel('Customer', { exact: true }).selectOption({ label: 'Ada Lovelace' })
      calls = []
      await page.getByRole('button', { name: 'Add order' }).click()
      await page.getByText('This is needed.').waitFor()
      const total = await page.getByLabel('Total', { exact: true }).boundingBox()
      const failure = await described(page, 'Total')
      assert.deepEqual(
        failure.map((part) => part.words),
        ['This is needed.'],
        'the words describe the total',
      )
      assert.equal(await page.getByText('This is needed.').count(), 1, 'no other field has them')
      assert.equal(await page.getByLabel('Total', { exact: true }).getAttribute('aria-invalid'), 'true')
      assert.ok(total && failure[0] && failure[0].top >= total.y + total.height - 1, 'the words stand under the total')
      // Time for a call to leave, had the form made one.
      await page.waitForTimeout(500)
      assert.deepEqual(calls, [])
      assert.ok(page.url().endsWith('/orders/new'))
      await picture(page, 3)
    })

    test(`[04-1.4] an open order that is marked paid shows the status "paid" and no "Mark paid" (${engine})`, async () => {
      await page.getByRole('link', { name: 'Orders', exact: true }).click()
      await page.waitForURL('**/orders')
      await alive(page)
      await orderRows(page).first().getByRole('link').click()
      await page.waitForURL(/\/orders\/[0-9a-z]{26}$/)
      await main(page)
        .getByRole('heading', { level: 1, name: /^Order of / })
        .waitFor()
      await alive(page)
      await main(page).getByText('Open', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Mark paid' }).click()
      await main(page).getByText('Paid', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Mark paid' }).waitFor({ state: 'detached' })
      assert.equal(await page.getByText('Mark paid').count(), 0)
      assert.equal(await main(page).getByText('Open', { exact: true }).count(), 0)
      await picture(page, 4)
    })

    test(`[04-1.5] an order marked paid in one window leaves the open list of another staff user's window, with no reload (${engine})`, async () => {
      const other = await (await contextOf(usable())).newPage()
      other.setDefaultTimeout(15_000)
      await signedInAt(other, running().address, DANA, '/orders')
      await alive(other)
      // The sign-in moves inside the page, so the address is /orders before the list stands in it.
      await main(other).getByRole('heading', { level: 1, name: 'Orders' }).waitFor()
      await orderRows(other).first().waitFor()
      const before = await orderRows(other).count()
      // The oldest open order, so that Ada Lovelace's stays open for the steps that read it.
      const leaving = await hrefOf(orderRows(other).last())
      await markPage(other)
      await page.goto(running().address + leaving)
      await alive(page)
      await page.getByRole('button', { name: 'Mark paid' }).click()
      await page.getByRole('button', { name: 'Mark paid' }).waitFor({ state: 'detached' })
      await other.locator(`a[href="${leaving}"]`).waitFor({ state: 'detached' })
      assert.equal(await orderRows(other).count(), before - 1)
      assert.ok(await pageKept(other), 'the second window was not reloaded')
      await picture(other, 5)
      await other.context().close()
    })

    test(`[04-1.7] the tab "Paid", then "Next", then a reload show page 2 of the paid orders (${engine})`, async () => {
      await page.goto(`${running().address}/orders`)
      await alive(page)
      await main(page).getByRole('link', { name: /^Paid/ }).click()
      await page.waitForURL(/tab=paid/)
      await alive(page)
      const paid = (await rowsOf(running(), 'orders')).map(asRow).filter((row) => row.status === 'paid').length
      await main(page).getByText(`1 to 20 of ${paid}`).waitFor()
      assert.equal(await orderRows(page).count(), 20)
      await main(page).getByRole('link', { name: 'Next' }).click()
      await page.waitForURL(/page=2/)
      await alive(page)
      await main(page).getByText(`21 to ${paid} of ${paid}`).waitFor()
      assert.equal(await orderRows(page).count(), paid - 20)
      const seen = await Promise.all((await orderRows(page).all()).map(hrefOf))
      const at = new URL(page.url())
      assert.equal(at.searchParams.get('tab'), 'paid')
      assert.equal(at.searchParams.get('page'), '2')
      await page.reload()
      await alive(page)
      assert.equal(new URL(page.url()).search, at.search)
      assert.deepEqual(await Promise.all((await orderRows(page).all()).map(hrefOf)), seen)
      await picture(page, 7)
    })

    test(`[04-1.9] /tr/orders is the same screen in Turkish, with "$19,99" and the month as a Turkish word (${engine})`, async () => {
      await page.goto(`${running().address}/tr/orders`)
      await alive(page)
      assert.equal(await page.locator('html').getAttribute('lang'), 'tr')
      await main(page).getByRole('heading', { level: 1, name: 'Siparişler' }).waitFor()
      await main(page).getByRole('link', { name: 'Yeni sipariş' }).waitFor()
      const first = await shown(orderRows(page).first())
      assert.equal(first.name, 'Ada Lovelace')
      assert.equal(first.total, '$19,99')
      assert.match(first.day, TURKISH_MONTH)
      assert.match(first.day, /Haz/, 'June is written "Haz", and not as in English')
      await picture(page, 9)
    })

    test(`[04-1.10] from the list to an order and back with the keyboard only: the focus on each heading, and the list where it was (${engine})`, async () => {
      await page.goto(`${running().address}/orders?tab=paid&page=2`)
      await alive(page)
      const listed = await Promise.all((await orderRows(page).all()).map(hrefOf))
      let at = await focused(page)
      for (let press = 0; press < 40 && !(at.tag === 'A' && at.inList); press++) {
        await page.keyboard.press(tab)
        at = await focused(page)
      }
      assert.ok(at.tag === 'A' && at.inList, 'the keyboard reaches an order of the list')
      const scrolled = await page.evaluate(() => window.scrollY)
      await page.keyboard.press('Enter')
      await page.waitForURL(/\/orders\/[0-9a-z]{26}$/)
      await alive(page)
      await headingFocused(page, 'the order screen')
      assert.match((await focused(page)).text, /^Order of /)
      await picture(page, 10)
      await page.keyboard.press(backTab)
      assert.equal((await focused(page)).text, 'Back to orders')
      await page.keyboard.press('Enter')
      await page.waitForURL(/\/orders\?/)
      await alive(page)
      await headingFocused(page, 'the list, after going back')
      assert.equal((await focused(page)).text, 'Orders')
      const back = new URL(page.url())
      assert.equal(back.searchParams.get('tab'), 'paid')
      assert.equal(back.searchParams.get('page'), '2')
      assert.deepEqual(await Promise.all((await orderRows(page).all()).map(hrefOf)), listed)
      const now = await page.evaluate(() => window.scrollY)
      assert.ok(Math.abs(now - scrolled) <= 2, `the list is scrolled as it was: ${scrolled}, and now ${now}`)
    })

    test(`[04-1.11] a customer who signs in with email and password sees /mine, with their own orders and no other (${engine})`, async () => {
      adaPage = await (await contextOf(usable())).newPage()
      adaPage.setDefaultTimeout(15_000)
      await adaPage.goto(`${running().address}/sign-in`)
      await signIn(adaPage, ADA)
      await adaPage.waitForURL('**/mine')
      await alive(adaPage)
      await main(adaPage).getByRole('heading', { level: 1, name: 'My orders' }).waitFor()
      const ada = (await rowsOf(running(), 'users')).map(asRow).find((row) => row.email === ADA)
      const own = (await rowsOf(running(), 'orders'))
        .map(asRow)
        .filter((row) => row.placedBy === ada?.id)
        .map((row) => `/orders/${row.id}`)
      assert.ok(own.length > 0)
      const shownHere = await Promise.all((await orderRows(adaPage).all()).map(hrefOf))
      assert.deepEqual([...shownHere].sort(), [...own].sort())
      await picture(adaPage, 11)
    })

    test(`[04-1.12] a customer who opens the address of another customer's order is shown "not found" (${engine})`, async () => {
      const grace = (await rowsOf(running(), 'users')).map(asRow).find((row) => row.email === GRACE)
      const theirs = (await rowsOf(running(), 'orders')).map(asRow).find((row) => row.placedBy === grace?.id)
      assert.ok(theirs)
      const answer = await adaPage.goto(`${running().address}/orders/${theirs.id}`)
      assert.equal(answer?.status(), 404)
      await alive(adaPage)
      await adaPage.getByRole('heading', { level: 1, name: 'Not found' }).waitFor()
      assert.equal(await adaPage.getByText('Grace Hopper').count(), 0)
      await picture(adaPage, 12)
    })

    test(`[04-1.13] a receipt attached to an own order downloads as the same file, and another customer is told "not found" (${engine})`, async () => {
      await adaPage.goto(`${running().address}/mine`)
      await alive(adaPage)
      await orderRows(adaPage).first().getByRole('link').click()
      await adaPage.waitForURL(/\/orders\/[0-9a-z]{26}$/)
      await main(adaPage)
        .getByRole('heading', { level: 1, name: /^Order of / })
        .waitFor()
      await alive(adaPage)
      await adaPage.getByLabel('Receipt file').setInputFiles(RECEIPT)
      await adaPage.getByRole('button', { name: 'Attach receipt' }).click()
      const link = adaPage.getByRole('link', { name: 'Download receipt' })
      await link.waitFor()
      const [download] = await Promise.all([adaPage.waitForEvent('download'), link.click()])
      const saved = await download.path()
      assert.deepEqual(await readFile(saved), await readFile(RECEIPT))
      await picture(adaPage, 13)
      const address = (await link.getAttribute('href')) ?? ''
      assert.match(address, /^\/_t\/files\//)
      const grace = await contextOf(usable())
      const gracePage = await grace.newPage()
      await signedInAt(gracePage, running().address, GRACE, '/mine')
      await alive(gracePage)
      const asked = await grace.request.get(running().address + address, { maxRedirects: 0 })
      assert.equal(asked.status(), 404)
      await grace.close()
    })

    test(`[04-1.14] after signing out, /orders shows the sign-in, and signing in as staff leads to /orders (${engine})`, async () => {
      await adaPage.getByRole('button', { name: 'Sign out' }).click()
      await adaPage.getByRole('heading', { level: 1, name: 'Sign in' }).waitFor()
      assert.equal(new URL(adaPage.url()).pathname, '/sign-in')
      await adaPage.goto(`${running().address}/orders`)
      assert.equal(new URL(adaPage.url()).pathname, '/sign-in')
      await adaPage.getByRole('heading', { level: 1, name: 'Sign in' }).waitFor()
      await picture(adaPage, 14)
      await signIn(adaPage, SAM)
      await adaPage.waitForURL(/\/orders$/)
      await alive(adaPage)
      await main(adaPage).getByRole('heading', { level: 1, name: 'Orders' }).waitFor()
      await adaPage.context().close()
    })
  })

  describe(`the walk of sample app 1 under tent dev, in ${engine}`, () => {
    let temp: { path: string; remove: () => Promise<void> } | undefined
    let folder = ''
    let app: RunningApp | undefined
    let browser: Browser | undefined
    let page: Page
    const askings: { query: string; search: string }[] = []

    // Saves a changed word into the English messages, a file of the screens, as a person does in an editor.
    async function save(from: string, to: string): Promise<void> {
      const file = join(folder, 'messages', 'en.ts')
      const words = await readFile(file, 'utf8')
      assert.ok(words.includes(from), `the words hold ${from}`)
      await writeFile(file, words.replace(from, to))
    }

    before(async () => {
      await mkdir(pictures, { recursive: true })
      await ensurePackages()
      temp = await tempFolder()
      folder = await copyApp(join(temp.path, 'app'))
      app = await devApp(folder)
      browser = await browserType.launch()
      const context = await contextOf(browser)
      page = await context.newPage()
      page.setDefaultTimeout(20_000)
      await page.setViewportSize({ width: 1280, height: 640 })
      // Every asking of a query that reads the search: a watch over the live connection, or a read through the door.
      const note = (query: string, input: unknown) => {
        const search = Object(input).search
        if (typeof search === 'string' && search !== '') askings.push({ query, search })
      }
      page.on('websocket', (socket) =>
        socket.on('framesent', ({ payload }) => {
          const message: unknown = typeof payload === 'string' && payload.startsWith('{') ? JSON.parse(payload) : {}
          if (Object(message).t === 'watch') note(String(Object(message).query), Object(message).input)
        }),
      )
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (url.pathname.startsWith('/_t/read/')) {
          const body: unknown = request.postData()?.startsWith('{') ? JSON.parse(request.postData() ?? '{}') : {}
          note(url.pathname.slice('/_t/read/'.length), Object(body).input ?? body)
        }
      })
      await signedInAt(page, app.address, SAM, '/orders?tab=paid')
    })

    after(async () => {
      await browser?.close()
      await app?.stop()
      if (folder) await unlinkApp(folder)
      await temp?.remove()
    })

    test(`[04-1.6] a word saved in a screen's file while the page is open shows with no reload, the page scrolled where it was (${engine})`, async () => {
      await alive(page)
      await orderRows(page).nth(19).waitFor()
      // The move of the sign-in ends with the focus on the heading, which puts the page at its top: the person scrolls after it.
      await headingFocused(page, 'the orders, after the sign-in')
      await page.evaluate(() => window.scrollTo(0, 400))
      const scrolled = await page.evaluate(() => window.scrollY)
      assert.ok(scrolled > 100, 'the list is scrolled down')
      await markPage(page)
      await save("lead: 'Find an order, open it, and mark it paid.'", "lead: 'Every order of the shop, newest first.'")
      await page.getByText('Every order of the shop, newest first.').waitFor({ state: 'attached' })
      assert.ok(await pageKept(page), 'the page was not reloaded')
      const now = await page.evaluate(() => window.scrollY)
      assert.ok(Math.abs(now - scrolled) <= 2, `the page is scrolled as it was: ${scrolled}, and now ${now}`)
      await picture(page, 6)
    })

    test(`[04-1.8] the search asks each query once after the typing stopped, and a saved word keeps the tab and the search (${engine})`, async () => {
      await page.evaluate(() => window.scrollTo(0, 0))
      askings.length = 0
      await page.getByLabel('Search by customer').pressSequentially('Grace Hopper', { delay: 60 })
      await page.waitForFunction(() => {
        const names = [...document.querySelectorAll('main tbody tr a')].map((a) => a.textContent)
        return names.length > 0 && names.every((name) => name === 'Grace Hopper')
      })
      // Time for a late asking to show, had the typing set off one.
      await page.waitForTimeout(1000)
      for (const row of await orderRows(page).all()) assert.equal((await shown(row)).name, 'Grace Hopper')
      for (const query of ['ordersByStatus', 'orderCount']) {
        const of = askings.filter((one) => one.query === query)
        assert.deepEqual(
          of.map((one) => one.search),
          ['Grace Hopper'],
          `${query} is asked once, with the whole name`,
        )
      }
      await save("    title: 'Orders',", "    title: 'All orders',")
      await main(page).getByRole('heading', { level: 1, name: 'All orders' }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('tab'), 'paid')
      assert.equal(await page.getByLabel('Search by customer').inputValue(), 'Grace Hopper')
      for (const row of await orderRows(page).all()) assert.equal((await shown(row)).name, 'Grace Hopper')
      await picture(page, 8)
    })
  })
}
