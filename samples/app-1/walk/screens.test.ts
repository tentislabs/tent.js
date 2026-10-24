import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import type { Browser, BrowserContext, BrowserContextOptions, Page } from 'playwright-core'
import { APP_FOLDER, buildApp, ensurePackages, type RunningApp, startApp, tempFolder } from './app.ts'
import { ADA, alive, asked, contextOf, engineOf, pictureOf, SAM, signedInAt } from './page.ts'

// Each screen of the app in light and in dark, on a wide window and at phone width, for a person to look at.
// Each is taken with less motion asked for, so that nothing is caught moving between two screens.
const STILL = { reducedMotion: 'reduce' } as const
const LOOKS: { name: string; options: BrowserContextOptions }[] = [
  { name: 'light', options: { ...STILL, colorScheme: 'light', viewport: { width: 1280, height: 800 } } },
  { name: 'dark', options: { ...STILL, colorScheme: 'dark', viewport: { width: 1280, height: 800 } } },
  { name: 'phone-light', options: { ...STILL, colorScheme: 'light', viewport: { width: 390, height: 844 } } },
  { name: 'phone-dark', options: { ...STILL, colorScheme: 'dark', viewport: { width: 390, height: 844 } } },
]

type Kept = Awaited<ReturnType<BrowserContext['storageState']>>
type Shot = {
  name: string
  as: 'staff' | 'customer' | 'visitor'
  path: () => string
  then?: (page: Page) => Promise<void>
}

for (const engine of asked) {
  const browserType = engineOf(engine)
  const folder = join(APP_FOLDER, 'walk', 'pictures', engine, 'screens')

  describe(`the screens of sample app 1 in light, in dark and at phone width, in ${engine}`, () => {
    let temp: { path: string; remove: () => Promise<void> } | undefined
    let app: RunningApp | undefined
    let browser: Browser | undefined
    const kept = new Map<'staff' | 'customer', Kept>()
    let openOrder = ''
    let adaOrder = ''

    before(async () => {
      await mkdir(folder, { recursive: true })
      await ensurePackages()
      temp = await tempFolder()
      const bundle = await buildApp(APP_FOLDER, join(temp.path, 'bundle'))
      app = await startApp(APP_FOLDER, bundle, join(temp.path, 'data'))
      browser = await browserType.launch()
      for (const [who, email, to] of [
        ['staff', SAM, '/orders'],
        ['customer', ADA, '/mine'],
      ] as const) {
        const context = await contextOf(browser, STILL)
        const page = await context.newPage()
        await signedInAt(page, app.address, email, to)
        await alive(page)
        const first =
          (await page.getByRole('main').getByRole('table').getByRole('link').first().getAttribute('href')) ?? ''
        if (who === 'staff') openOrder = first
        else adaOrder = first
        kept.set(who, await context.storageState())
        await context.close()
      }
    })

    after(async () => {
      await browser?.close()
      await app?.stop()
      await temp?.remove()
    })

    const shots: Shot[] = [
      { name: 'sign-in', as: 'visitor', path: () => '/sign-in' },
      { name: 'not-found', as: 'visitor', path: () => '/nowhere' },
      { name: 'overview', as: 'staff', path: () => '/' },
      { name: 'orders', as: 'staff', path: () => '/orders' },
      { name: 'orders-paid-2', as: 'staff', path: () => '/orders?tab=paid&page=2' },
      {
        name: 'orders-none',
        as: 'staff',
        path: () => '/orders',
        then: async (page) => {
          await page.getByLabel('Search by customer').fill('Nobody at all')
          await page.getByText('No order fits').waitFor()
        },
      },
      { name: 'orders-tr', as: 'staff', path: () => '/tr/orders' },
      { name: 'order', as: 'staff', path: () => openOrder },
      { name: 'new-order', as: 'staff', path: () => '/orders/new' },
      {
        name: 'new-order-failed',
        as: 'staff',
        path: () => '/orders/new',
        then: async (page) => {
          await page.getByRole('button', { name: 'Add order' }).click()
          await page.getByText('This is needed.').first().waitFor()
        },
      },
      { name: 'customers', as: 'staff', path: () => '/customers' },
      { name: 'new-customer', as: 'staff', path: () => '/customers/new' },
      { name: 'mine', as: 'customer', path: () => '/mine' },
      { name: 'own-order', as: 'customer', path: () => adaOrder },
    ]

    for (const look of LOOKS) {
      test(`each screen, ${look.name} (${engine})`, async () => {
        if (!browser || !app) throw new Error('The app did not start.')
        for (const shot of shots) {
          const storageState = shot.as === 'visitor' ? undefined : kept.get(shot.as)
          const context = await contextOf(browser, { ...look.options, storageState })
          const page = await context.newPage()
          await page.goto(app.address + shot.path())
          await alive(page)
          await shot.then?.(page)
          await pictureOf(page, join(folder, `${shot.name}-${look.name}.png`))
          await context.close()
        }
      })
    }

    test(`a move that waits for its data shows the shapes of the screen (${engine})`, async () => {
      if (!browser || !app) throw new Error('The app did not start.')
      const context = await contextOf(browser, { ...LOOKS[0]?.options, storageState: kept.get('staff') })
      const page = await context.newPage()
      await page.goto(`${app.address}/orders`)
      await alive(page)
      // Every request of the page waits a while, so the move to the customers is caught while it waits.
      await context.route(
        (url) => url.hostname === 'localhost',
        async (route) => {
          await new Promise((done) => setTimeout(done, 2500))
          await route.continue()
        },
      )
      await page.getByRole('link', { name: 'Customers', exact: true }).click()
      await page.getByRole('status', { name: 'Loading' }).waitFor()
      await pictureOf(page, join(folder, 'loading-light.png'))
      await context.close()
    })
  })
}
