import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import {
  type Browser,
  type BrowserContextOptions,
  type BrowserType,
  chromium,
  firefox,
  type Page,
  webkit,
} from 'playwright-core'
import { build, folder, type Running, rows, start, tent } from './app.ts'
import { type Files, files } from './files.ts'

const engines: Record<string, BrowserType> = { chromium, firefox, webkit }
const chosen = (process.env.WALK_ENGINES ?? 'chromium,firefox,webkit').split(',').filter((one) => one in engines)
const videoHost = 'https://www.youtube-nocookie.com'
const desk = { width: 1280, height: 800 }

type Feature = { id: string; name: string; summary: string; picture: string; video?: string; createdAt: string }

let bundle = ''

before(async () => {
  bundle = await build()
})

for (const engine of chosen) {
  describe(engine, () => {
    const kind = engines[engine]
    const pictures = join(folder, 'walk', 'pictures', engine)
    // Firefox has no mobile mode: there a phone is its size, its touch and its density alone.
    const phone: BrowserContextOptions = {
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      deviceScaleFactor: 2,
      ...(engine === 'firefox' ? {} : { isMobile: true }),
    }
    let running: Running
    let browser: Browser
    let features: Feature[] = []
    // The engine answers 300 screens a minute to one address: the walk keeps under it.
    const visits: number[] = []

    before(async () => {
      mkdirSync(pictures, { recursive: true })
      running = await start(bundle)
      browser = await kind.launch({ headless: true })
      const found = await rows('features', running.data)
      features = found
        .map((row) => ({
          id: String(row.id),
          name: String(row.name),
          summary: String(row.summary),
          picture: String(row.picture),
          video: typeof row.video === 'string' ? row.video : undefined,
          createdAt: String(row.createdAt),
        }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    })

    after(async () => {
      await browser?.close()
      running?.stop()
    })

    async function paced(cost = 1) {
      const now = Date.now()
      while (visits.length > 0 && now - visits[0] > 60000) visits.shift()
      if (visits.length + cost > 250) {
        await new Promise((done) => setTimeout(done, 60500 - (now - visits[0])))
        visits.length = 0
      }
      for (let k = 0; k < cost; k++) visits.push(Date.now())
    }

    /** Opens an address, counted against the minute of the engine where the engine serves it. */
    async function visit(page: Page, address: string, waitUntil: 'load' | 'commit' = 'load') {
      if (address.startsWith(running.origin)) await paced()
      await page.goto(address, { waitUntil })
    }

    async function open(options: BrowserContextOptions = {}) {
      const context = await browser.newContext({ viewport: desk, ...options })
      return { context, page: await context.newPage() }
    }

    async function alive(page: Page) {
      await page.locator('#tent[data-t-alive]').waitFor({ timeout: 15000 })
    }

    /** Waits until nothing moves: the fonts and pictures are in, every animation and transition has ended, and the number has counted. */
    async function settle(page: Page) {
      // Asked from the walk and never awaited inside the page, so a page with no script, whose timers never run, settles too.
      const still = () =>
        page.evaluate(
          () =>
            document.fonts.status === 'loaded' &&
            [...document.images].every((one) => {
              const box = one.getBoundingClientRect()
              return one.complete || box.bottom < 0 || box.top > window.innerHeight
            }) &&
            document.getAnimations().every((one) => one.playState === 'finished' || one.playState === 'idle') &&
            [...document.querySelectorAll('[data-counted="no"]')].every((one) => {
              const box = one.getBoundingClientRect()
              return box.bottom < 0 || box.top > window.innerHeight
            }),
        )
      for (let k = 0; k < 150 && !(await still()); k++) await page.waitForTimeout(100)
      await page.waitForTimeout(100)
    }

    async function picture(page: Page, name: string, full = false) {
      await settle(page)
      await page.screenshot({ path: join(pictures, `${name}.png`), fullPage: full })
    }

    /** Scrolls the whole page once, so that every card has risen and the number has counted, and back to the top. */
    async function seeAll(page: Page) {
      const height = await page.evaluate(() => document.documentElement.scrollHeight)
      for (let y = 0; y < height; y += 300) {
        await page.evaluate((to) => window.scrollTo(0, to), y)
        await page.waitForTimeout(60)
      }
      await settle(page)
      await page.evaluate(() => window.scrollTo(0, 0))
    }

    /** What the person reads on the page, with the white space of the layout made one space. */
    async function shownText(page: Page): Promise<string> {
      return (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    }

    /** Step 1: every word of the home page, with no script. */
    async function everyWord(origin: string, name: string) {
      const { context, page } = await open({ javaScriptEnabled: false })
      await visit(page, `${origin}/`)
      const read = await shownText(page)
      const expected = [
        'Tillwise',
        'Home',
        'Pricing',
        'Gallery',
        'Contact',
        'Türkçe',
        'Light',
        'Dark',
        'The till for small shops',
        'Tillwise keeps your till, your stock and your orders in step, on every device you own.',
        'See the prices',
        'Look at the screens',
        'What it does',
        'Five tools in one, each a press away.',
        ...features.slice(0, 3).flatMap((one) => [one.name, one.summary, `Read more about ${one.name}`]),
        'A day at the till',
        'Built for the shop floor',
        'Three moves, and the day is in order.',
        'Scan a product, or tap it on the screen.',
        'Take the payment by card, by phone or in cash.',
        'Watch the stock follow by itself, on every till.',
        'In use today',
        '12,480',
        'shops sell with Tillwise every day',
        'Open tomorrow with Tillwise',
        'Every plan holds every feature, and you can write to us before you choose.',
        'Write to us',
        'Tillwise, the till and the stock of a small shop in one tool.',
      ]
      // A small heading in capitals is read as the browser shows it, in capitals.
      for (const one of expected)
        assert.ok(read.toLowerCase().includes(one.toLowerCase()), `the page with no script shows "${one}"`)
      assert.equal(await page.locator('h1').getAttribute('aria-label'), 'Run your shop from one screen')
      // WebKit leaves out of its reading the space where a line of the headline breaks, so its letters are read as written.
      assert.equal((await page.locator('h1').textContent())?.replace(/\s+/g, ' '), 'Run your shop from one screen')
      assert.ok(await page.locator('h1').isVisible(), 'the headline is shown')
      assert.equal(await page.locator('.card').count(), 3)
      await picture(page, `${name}-home-no-script`, true)
      await context.close()
    }

    /** Step 2: the switch to yearly prices, and the border of the chosen plan. */
    async function yearly(origin: string, name: string) {
      const { context, page } = await open()
      await visit(page, `${origin}/pricing`)
      await alive(page)
      const border = (plan: string) =>
        page.locator(`[data-plan="${plan}"]`).evaluate((one) => getComputedStyle(one).borderTopColor)
      const accent = await page.locator('.badge').evaluate((one) => getComputedStyle(one).backgroundColor)
      await settle(page)
      assert.equal(await border('pro'), accent, 'the plan chosen at first is Pro, in the accent')
      assert.notEqual(await border('starter'), accent)
      assert.ok((await shownText(page)).includes('$29.00 a month'))
      await picture(page, `${name}-pricing-monthly`)
      const flip = page.getByRole('switch', { name: 'Pay yearly' })
      assert.equal(await flip.getAttribute('aria-checked'), 'false')
      await paced()
      await flip.click()
      await page.waitForFunction(
        () => document.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'true',
      )
      const read = await shownText(page)
      for (const price of ['$90.00 a year', '$290.00 a year', '$790.00 a year'])
        assert.ok(read.includes(price), `the yearly price ${price} is shown`)
      assert.ok(!read.includes('a month'), 'no monthly price is left')
      await settle(page)
      assert.equal(await border('pro'), accent, 'the chosen plan keeps its border')
      await picture(page, `${name}-pricing-yearly`)
      await paced()
      await page.getByRole('link', { name: 'Choose Business' }).click()
      await page.waitForFunction((color) => {
        const chosen = document.querySelector('[data-plan="business"]')
        return chosen?.classList.contains('chosen') && getComputedStyle(chosen).borderTopColor === color
      }, accent)
      await settle(page)
      assert.equal(await border('business'), accent, 'the border moves to the plan that was chosen')
      assert.notEqual(await border('pro'), accent)
      assert.ok((await shownText(page)).includes('$790.00 a year'), 'the prices stay yearly')
      await picture(page, `${name}-pricing-business`)
      await context.close()
    }

    /** Step 4: "Türkçe" in the bar of links shows the same page under /tr. */
    async function turkish(origin: string, name: string) {
      const { context, page } = await open()
      for (const [path, heading] of [
        ['/', 'Dükkanınızı tek ekrandan yönetin'],
        ['/pricing', 'Fiyatlar'],
      ]) {
        await visit(page, `${origin}${path}`)
        await alive(page)
        await paced()
        await page
          .getByRole('navigation', { name: 'The pages of the site' })
          .getByRole('link', { name: 'Türkçe' })
          .click()
        await page.waitForURL(`${origin}${path === '/' ? '/tr' : `/tr${path}`}`)
        await page.waitForFunction(() => document.documentElement.lang === 'tr')
        const h1 = page.locator('h1')
        assert.equal((await h1.getAttribute('aria-label')) ?? (await h1.innerText()), heading)
        const read = await shownText(page)
        for (const one of ['Ana sayfa', 'Fiyatlar', 'Galeri', 'İletişim', 'English', 'Koyu'])
          assert.ok(read.includes(one), `the Turkish page shows "${one}"`)
        assert.ok(!read.includes('Türkçe'), 'the Turkish page offers English, not Turkish')
        await picture(page, `${name}-turkish${path.replace('/', '-')}`)
      }
      await context.close()
    }

    /** Step 5: the sitemap lists every screen once for each language, and every feature page. */
    async function sitemap(origin: string) {
      if (origin === running.origin) await paced()
      const answer = await fetch(`${origin}/sitemap.xml`)
      assert.equal(answer.status, 200)
      const listed = [...(await answer.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((one) => one[1])
      const paths = ['/', '/pricing', '/gallery', '/contact', ...features.map((one) => `/features/${one.id}`)]
      const expected = [...paths, ...paths.map((path) => (path === '/' ? '/tr' : `/tr${path}`))]
      assert.deepEqual(listed.map((one) => new URL(one).pathname).sort(), expected.sort())
      if (origin !== running.origin)
        assert.ok(
          listed.every((one) => one.startsWith(`${origin}/`)),
          'the export names its origin',
        )
    }

    /** Step 7: on a phone, the headline letter by letter, the cards rising in turn, the pinned section, the count. */
    async function motion(origin: string, name: string) {
      const { context, page } = await open(phone)
      await visit(page, `${origin}/`, 'commit')
      await page.locator('.headline .letter').first().waitFor({ state: 'attached' })
      // The letters move from the moment the style file is in, which the page may still be fetching.
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.headline .letter')].every((one) => one.getAnimations().length > 0),
      )
      const letters = await page.locator('.headline .letter').evaluateAll((all) =>
        all.map((one) => {
          const [moving] = one.getAnimations()
          const timing = moving?.effect?.getTiming()
          return {
            name: moving instanceof CSSAnimation ? moving.animationName : '',
            delay: Number(timing?.delay ?? -1),
          }
        }),
      )
      assert.ok(letters.length > 20)
      assert.ok(
        letters.every((one) => one.name === 'arrive'),
        'every letter arrives',
      )
      assert.ok(
        letters.every((one, place) => place === 0 || one.delay > letters[place - 1].delay),
        'each letter arrives after the one before it',
      )
      const seen = await page
        .locator('.headline .letter')
        .evaluateAll((all) => all.map((one) => Number(getComputedStyle(one).opacity)))
      assert.ok(seen[0] >= seen[seen.length - 1], 'the first letter is never behind the last')
      await alive(page)
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.headline .letter')].every((one) => getComputedStyle(one).opacity === '1'),
      )
      await picture(page, `${name}-phone-headline-whole`)

      const cards = page.locator('.card')
      const opacity = (place: number) => cards.nth(place).evaluate((one) => Number(getComputedStyle(one).opacity))
      const rise = (place: number) =>
        cards.nth(place).evaluate((one) => new DOMMatrix(getComputedStyle(one).transform).m42)
      const boxes = await cards.evaluateAll((all) => all.map((one) => one.getBoundingClientRect().top))
      assert.ok(
        boxes.every((top, place) => place === 0 || top > boxes[place - 1]),
        'on a phone the cards stand one under another',
      )
      assert.ok((await opacity(2)) < 1, 'the last card has not risen while it is out of view')
      await page.evaluate(() => {
        const first = document.querySelectorAll('.card')[0]
        window.scrollTo(0, window.scrollY + first.getBoundingClientRect().top - 120)
      })
      await page.waitForFunction(() => getComputedStyle(document.querySelectorAll('.card')[0]).opacity === '1')
      assert.ok((await opacity(2)) < 1, 'the cards rise in turn: the first has risen, the last not yet')
      assert.ok((await rise(2)) > 0, 'the last card still stands low')
      await picture(page, `${name}-phone-first-card-risen`)
      await page.evaluate(() => {
        const last = document.querySelectorAll('.card')[2]
        window.scrollTo(0, window.scrollY + last.getBoundingClientRect().top - 120)
      })
      await page.waitForFunction(() => getComputedStyle(document.querySelectorAll('.card')[2]).opacity === '1')
      await settle(page)
      assert.equal(await rise(2), 0)
      await picture(page, `${name}-phone-cards-risen`)

      const panel = page.locator('.pinned-panel')
      await page.evaluate(() => {
        const steps = document.querySelector('.pinned-steps')
        if (steps) window.scrollTo(0, window.scrollY + steps.getBoundingClientRect().top)
      })
      const pinnedAt = await panel.evaluate((one) => one.getBoundingClientRect().top)
      await picture(page, `${name}-phone-pinned-first`)
      await page.evaluate(() => window.scrollBy(0, 400))
      await page.waitForFunction((at) => {
        const steps = document.querySelector('.pinned-steps')?.getBoundingClientRect().top ?? 0
        return steps < at - 300
      }, pinnedAt)
      const pinnedLater = await panel.evaluate((one) => one.getBoundingClientRect().top)
      assert.ok(Math.abs(pinnedLater - pinnedAt) < 2, `the section stays pinned (${pinnedAt}, then ${pinnedLater})`)
      await picture(page, `${name}-phone-pinned-later`)

      const number = page.locator('.count-number')
      await number.evaluate((one) => one.scrollIntoView({ block: 'center' }))
      const counted: string[] = []
      for (let k = 0; k < 80 && counted[counted.length - 1] !== '12,480'; k++) {
        counted.push(await number.innerText())
        await page.waitForTimeout(50)
      }
      const values = counted.map((one) => Number(one.replace(/,/g, '')))
      assert.ok(
        values.some((one) => one > 0 && one < 12480),
        `the number counts up: ${counted.join(' ')}`,
      )
      assert.ok(
        values.every((one, place) => place === 0 || one >= values[place - 1]),
        'the number only goes up',
      )
      assert.equal(counted[counted.length - 1], '12,480')
      await picture(page, `${name}-phone-counted`)
      await context.close()
    }

    /** Step 8: with "reduce motion" on, everything stands in its place and nothing moves. */
    async function still(origin: string, name: string) {
      const { context, page } = await open({ ...phone, reducedMotion: 'reduce' })
      await visit(page, `${origin}/`)
      await alive(page)
      const moving = () => page.evaluate(() => document.getAnimations().length)
      assert.equal(await moving(), 0, 'nothing moves')
      assert.ok(
        await page.evaluate(() =>
          [...document.querySelectorAll('.headline .letter, .card')].every(
            (one) => getComputedStyle(one).opacity === '1',
          ),
        ),
        'every letter and every card stands in its place',
      )
      assert.equal(await page.locator('.hero-picture').evaluate((one) => getComputedStyle(one).transform), 'none')
      await picture(page, `${name}-still-top`)
      for (const part of ['.cards', '.pinned', '.count']) {
        await page.locator(part).evaluate((one) => one.scrollIntoView({ block: 'center' }))
        assert.equal(await moving(), 0, `nothing moves at ${part}`)
      }
      assert.equal(await page.locator('.count-number').innerText(), '12,480', 'the number stands as it ends')
      await picture(page, `${name}-still-count`)
      await context.close()
    }

    /** Step 9: from the gallery to a feature, the picture travelling to its place, and the name in the tab. */
    async function travel(origin: string, name: string) {
      const { context, page } = await open()
      await context.addInitScript(() => {
        Reflect.set(window, 'transitions', 0)
        const own = document.startViewTransition?.bind(document)
        if (own)
          document.startViewTransition = (...given: Parameters<typeof own>) => {
            Reflect.set(window, 'transitions', Number(Reflect.get(window, 'transitions')) + 1)
            return own(...given)
          }
      })
      await visit(page, `${origin}/gallery`)
      await alive(page)
      await settle(page)
      const row = page.locator('.gallery .row')
      // A picture past the end of the row waits for it to scroll near, as a lazy picture does in each engine its own way.
      const loaded = await page.locator('.gallery .row img').evaluateAll((all) =>
        all.map((one) => {
          const box = one.getBoundingClientRect()
          const seen = box.left < window.innerWidth && box.right > 0
          return { seen, loaded: one instanceof HTMLImageElement && one.complete && one.naturalWidth > 0 }
        }),
      )
      assert.equal(loaded.length, features.length)
      assert.ok(
        loaded.every((one) => !one.seen || one.loaded),
        'every picture in view has loaded',
      )
      await row.evaluate((strip) => strip.scrollBy({ left: 170, behavior: 'smooth' }))
      await page.waitForFunction(() => {
        const strip = document.querySelector('.gallery .row')
        if (!(strip instanceof HTMLElement) || strip.scrollLeft === 0) return false
        const start = strip.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(strip).scrollPaddingLeft)
        return [...strip.querySelectorAll('li')].some((one) => Math.abs(one.getBoundingClientRect().left - start) < 2)
      })
      await picture(page, `${name}-gallery-at-rest`)
      const target = features[1]
      await page.getByRole('link', { name: target.name }).scrollIntoViewIfNeeded()
      await paced()
      await page.getByRole('link', { name: target.name }).click()
      await page.waitForURL(`${origin}/features/${target.id}`)
      await page.locator('h1', { hasText: target.name }).waitFor()
      await picture(page, `${name}-feature-arrived`)
      assert.equal(await page.title(), target.name, 'the name of the feature is in the tab')
      assert.equal(
        await page.locator('.feature-picture').evaluate((one) => getComputedStyle(one).viewTransitionName),
        `picture-${target.id}`,
      )
      assert.ok(
        await page.evaluate(() => Number(Reflect.get(window, 'transitions')) > 0),
        'the move between the screens took a view transition',
      )
      await context.close()
    }

    /** Of step 11: on an exported page the dark choice holds from the moment the page has come alive. */
    async function darkOnceAlive(origin: string) {
      const { context, page } = await open()
      await visit(page, `${origin}/`)
      await alive(page)
      await page.getByRole('button', { name: 'Dark' }).click()
      await page.waitForFunction(() => document.documentElement.dataset.mode === 'dark')
      await visit(page, `${origin}/pricing`)
      await alive(page)
      await page.waitForFunction(
        () => document.querySelector('[role="button"][aria-pressed="true"]')?.textContent === 'Dark',
        undefined,
        { timeout: 10000 },
      )
      assert.equal(await page.evaluate(() => document.documentElement.dataset.mode), 'dark')
      await picture(page, '11-6-dark-once-alive')
      await context.close()
    }

    /** Step 10: a stand-in and no request to the video host before "Show videos"; then the video on every feature. */
    async function videos(origin: string, name: string) {
      const { context, page } = await open()
      const asked: string[] = []
      await context.route(`${videoHost}/**`, (route) => {
        asked.push(route.request().url())
        return route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>A video</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 30% 30%,#1d3b30,#050807);color:#fff;font:600 18px system-ui">The player</body>',
        })
      })
      const [first, second] = features.filter((one) => one.video)
      await visit(page, `${origin}/features/${first.id}`)
      await alive(page)
      assert.ok((await shownText(page)).includes('The video is on another site, which sees your visit once it plays.'))
      assert.equal(await page.locator('iframe').count(), 0)
      assert.deepEqual(asked, [], 'nothing is asked of the video host before the visitor agrees')
      await page.locator('.video').scrollIntoViewIfNeeded()
      await picture(page, `${name}-video-stand-in`)
      await page.getByRole('button', { name: 'Show videos' }).click()
      const frame = page.frameLocator('.video iframe')
      await frame.locator('body', { hasText: 'The player' }).waitFor()
      assert.deepEqual(asked, [first.video])
      await picture(page, `${name}-video-shown`)
      await visit(page, `${origin}/features/${second.id}`)
      await alive(page)
      // A served page knows the choice in its first HTML; an exported one, which no engine drew, once it has come alive.
      if (origin !== running.origin) await page.locator('.video iframe').waitFor({ timeout: 10000 })
      assert.equal(
        await page.getByRole('button', { name: 'Show videos' }).count(),
        0,
        'no question on the next feature',
      )
      await page.frameLocator('.video iframe').locator('body', { hasText: 'The player' }).waitFor()
      assert.deepEqual(asked, [first.video, second.video])
      await page.locator('.video').scrollIntoViewIfNeeded()
      await picture(page, `${name}-video-next`)
      await context.close()
    }

    test(`[04-2.1] / with scripts switched off shows every word of the page (${engine})`, async () => {
      await everyWord(running.origin, '1')
    })

    test(`[04-2.2] /pricing: the switch shows the yearly prices, and the chosen plan has its border (${engine})`, async () => {
      await yearly(running.origin, '2')
    })

    test(`[04-2.3] the contact form says "Thank you" and keeps one row each time, with and without scripts; the 61st send in a minute is refused (${engine})`, async () => {
      const message = { email: 'ada@example.com', text: 'Does the till work on an old tablet?' }
      const before = (await rows('messages', running.data)).length
      const { context, page } = await open()
      await page.goto(`${running.origin}/contact`)
      await alive(page)
      await picture(page, '3-contact')
      await page.getByLabel('Your email').fill(message.email)
      await page.getByLabel('Your message').fill(message.text)
      await page.getByRole('button', { name: 'Send' }).click()
      await page.getByRole('heading', { name: 'Thank you' }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('sent'), 'true')
      assert.equal((await rows('messages', running.data)).length, before + 1)
      await picture(page, '3-thank-you')

      const bare = await open({ javaScriptEnabled: false })
      await bare.page.goto(`${running.origin}/contact`)
      await bare.page.getByLabel('Your email').fill('grace@example.com')
      await bare.page.getByLabel('Your message').fill('Can I pay for the year by invoice?')
      await bare.page.getByRole('button', { name: 'Send' }).click()
      await bare.page.getByRole('heading', { name: 'Thank you' }).waitFor()
      assert.equal(new URL(bare.page.url()).pathname, '/contact')
      assert.equal(new URL(bare.page.url()).searchParams.get('sent'), 'true', '/contact?sent=true shows it')
      const kept = await rows('messages', running.data)
      assert.equal(kept.length, before + 2)
      assert.deepEqual(kept.map((one) => one.email).sort(), ['ada@example.com', 'grace@example.com'])
      await picture(bare.page, '3-thank-you-no-script')
      await bare.context.close()

      const began = Date.now()
      const answers = await page.evaluate(async (input) => {
        const all: { status: number; code?: string }[] = []
        for (let k = 3; k <= 61; k++) {
          const answer = await fetch('/_t/call/sendMessage', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ input: { ...input, text: `${input.text} (${k})` } }),
          })
          const body = await answer.json()
          all.push({ status: answer.status, code: body?.error?.code })
        }
        return all
      }, message)
      const refused = answers.findIndex((one) => one.status !== 200)
      assert.ok(refused >= 0, 'a send is refused')
      assert.equal(refused + 3, 61, `the first refused send is the 61st: ${JSON.stringify(answers.slice(-3))}`)
      assert.deepEqual(answers[answers.length - 1], { status: 429, code: 'T0005' })
      assert.equal((await rows('messages', running.data)).length, before + 2 + refused)
      await context.close()
      // The address is refused until its minute is over, and the steps after this one are the same visitor's.
      await new Promise((done) => setTimeout(done, Math.max(0, 61000 - (Date.now() - began))))
    })

    test(`[04-2.4] "Türkçe" in the bar of links shows the same page under /tr, in Turkish (${engine})`, async () => {
      await turkish(running.origin, '4')
    })

    test(`[04-2.5] /sitemap.xml lists every screen once for each language, and every feature page (${engine})`, async () => {
      await sitemap(running.origin)
    })

    test(`[04-2.6] "Dark" holds when the browser is closed and opened again, from the first paint (${engine})`, async () => {
      const profile = mkdtempSync(join(tmpdir(), 'app-2-profile-'))
      const first = await kind.launchPersistentContext(profile, { headless: true, viewport: desk })
      const page = first.pages()[0] ?? (await first.newPage())
      await visit(page, `${running.origin}/`)
      await alive(page)
      await paced()
      await page.getByRole('button', { name: 'Dark' }).click()
      await page.waitForFunction(() => document.documentElement.dataset.mode === 'dark')
      await picture(page, '6-dark-picked')
      await first.close()

      const again = await kind.launchPersistentContext(profile, { headless: true, viewport: desk })
      let release: () => void = () => {}
      const held = new Promise<void>((done) => {
        release = done
      })
      // The page code is held back, so what is seen is the first paint: the HTML and its head alone.
      await again.route('**/_t/b/browser/page.*.js', async (route) => {
        await held
        await route.continue()
      })
      const later = again.pages()[0] ?? (await again.newPage())
      await visit(later, `${running.origin}/`, 'commit')
      await later.locator('.foot').waitFor({ state: 'attached' })
      assert.equal(await later.evaluate(() => document.documentElement.dataset.mode), 'dark')
      // No browser paints before the style file of the head is in, which may still be on its way.
      await later.waitForFunction(() => getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)')
      const paper = await later.evaluate(() => getComputedStyle(document.body).backgroundColor)
      assert.equal(paper, 'rgb(14, 17, 16)', 'the first paint is dark')
      assert.equal(await later.locator('#tent[data-t-alive]').count(), 0, 'the page had not come alive')
      // The motion of the style file runs with the page code held back too, so the first paint is taken once it ends.
      // Firefox takes no picture of a page whose code is still held, as it waits for the page to load its fonts.
      await settle(later)
      await later
        .screenshot({ path: join(pictures, '6-dark-first-paint.png'), timeout: 5000 })
        .catch(() => writeFileSync(join(pictures, '6-dark-first-paint.txt'), 'No picture: the engine waited.\n'))
      release()
      await alive(later)
      assert.equal(await later.evaluate(() => document.documentElement.dataset.mode), 'dark')
      assert.equal(await later.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed'), 'true')
      await picture(later, '6-dark-alive')
      await again.close()
    })

    test(`[04-2.7] on a phone, / shows the headline letter by letter, the cards rising in turn, the pinned section and the number counting up (${engine})`, async () => {
      await motion(running.origin, '7')
    })

    test(`[04-2.8] with "reduce motion" on, / has everything in its place and nothing moving (${engine})`, async () => {
      await still(running.origin, '8')
    })

    test(`[04-2.9] a feature opened from the gallery: the picture travels to its place, and its name is in the tab (${engine})`, async () => {
      await travel(running.origin, '9')
    })

    test(`[04-2.10] a feature asks before it loads a video, and after "Show videos" asks no more (${engine})`, async () => {
      await videos(running.origin, '10')
    })

    test(`[04-2.11] tent export, served by a plain server of files, walks steps 1, 2, 4, 5 and 7 to 10 (${engine})`, async (t) => {
      let host: Files | undefined
      try {
        host = await files()
        const out = mkdtempSync(join(tmpdir(), 'app-2-site-'))
        await tent(['export', '--out', out, '--origin', host.origin, '--data', running.data])
        host.serve(out)
        const at = host.origin
        for (const [step, walk] of [
          ['1', () => everyWord(at, '11-1')],
          ['2', () => yearly(at, '11-2')],
          ['4', () => turkish(at, '11-4')],
          ['5', () => sitemap(at)],
          ['7', () => motion(at, '11-7')],
          ['8', () => still(at, '11-8')],
          ['9', () => travel(at, '11-9')],
          ['10', () => videos(at, '11-10')],
          ['6', () => darkOnceAlive(at)],
        ] as const)
          await t.test(`step ${step} on the exported site`, walk)
      } finally {
        await host?.close()
      }
    })

    test(`every screen in light and dark, at a desk and on a phone, once nothing moves (${engine})`, async () => {
      const [withVideo] = features.filter((one) => one.video)
      const without = features.find((one) => !one.video) ?? features[0]
      const screens: [string, string][] = [
        ['home', '/'],
        ['home-tr', '/tr'],
        ['pricing', '/pricing'],
        ['gallery', '/gallery'],
        ['feature-video', `/features/${withVideo.id}`],
        ['feature', `/features/${without.id}`],
        ['contact', '/contact'],
        ['contact-sent', '/contact?sent=true'],
        ['not-found', '/nowhere'],
      ]
      for (const [size, options] of [
        ['desk', {}],
        ['phone', phone],
      ] as const)
        for (const look of ['light', 'dark'] as const) {
          const { context, page } = await open({ ...options, colorScheme: look })
          for (const [name, path] of screens) {
            await visit(page, `${running.origin}${path}`)
            await alive(page)
            await seeAll(page)
            await picture(page, `screen-${name}-${size}-${look}`, true)
          }
          await context.close()
        }
    })

    if (engine === chosen[0])
      test('[04-2.12] the budget rig weighs /: the main file of the page code and the module of the home screen are within the bar', async (t) => {
        await paced()
        const html = await (await fetch(`${running.origin}/`)).text()
        const main = /<script type="module" src="([^"]+)"/.exec(html)?.[1]
        const record = /<script type="application\/json" id="tent-page">([^<]+)<\/script>/.exec(html)?.[1]
        assert.ok(main && record, 'the page names its page code and its record')
        const screen: unknown = JSON.parse(record).load?.screen
        assert.equal(typeof screen, 'string')
        const weighed = await Promise.all(
          [main, `/_t/b/${String(screen)}`].map((one) => sent(new URL(one, running.origin).href)),
        )
        const total = weighed.reduce((sum, one) => sum + one.bytes, 0)
        const bars = JSON.parse(readFileSync(join(folder, '..', '..', 'budgets.json'), 'utf8'))
        const bar = Number(bars['page.weight']?.bar)
        const map = String(await tent(['map']))
        const packages = map
          .split('\n')
          .filter((line) => /browser \d+ bytes/.test(line))
          .map((line) => line.trim())
        const weights = {
          files: [main, `/_t/b/${String(screen)}`].map((one, place) => ({ file: one, ...weighed[place] })),
          total,
          bar,
          packages,
        }
        writeFileSync(join(pictures, '12-weights.json'), `${JSON.stringify(weights, null, 2)}\n`)
        t.diagnostic(JSON.stringify(weights))
        assert.ok(total <= bar, `the page code and the home screen weigh ${total} bytes, within the bar of ${bar}`)
      })
  })
}

/** The bytes of an answer as they travel, compressed as a browser asks for them. */
function sent(address: string): Promise<{ bytes: number; encoding: string }> {
  return new Promise((done, failed) => {
    get(address, { headers: { 'accept-encoding': 'br, gzip' } }, (answer) => {
      let bytes = 0
      answer.on('data', (chunk: Buffer) => {
        bytes += chunk.length
      })
      answer.on('end', () => done({ bytes, encoding: String(answer.headers['content-encoding'] ?? 'none') }))
      answer.on('error', failed)
    }).on('error', failed)
  })
}
