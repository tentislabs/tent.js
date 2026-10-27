import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test as each } from 'node:test'
import { measure } from '../../../rig/budgets.ts'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import {
  developedLibraries,
  laidLibraries,
  libraryScreens,
  movesOf,
  servedLibraries,
  styledOf,
  toldBy,
  frameTool,
  watched,
} from './librarying.ts'
import { typed } from './typed.ts'

// Not run on macOS, where this file did not end in the public run 40465200396 and its shard then hung.
const skip = process.platform === 'darwin' ? 'the file did not end on macOS in the public run 40465200396' : false
const test = (name: string, run: () => Promise<void>): void => void each(name, { skip }, run)

// The project is built for release and served once for the tests of this file, and once in `tent dev`.
let release: ReturnType<typeof servedLibraries> | undefined
const released = (): ReturnType<typeof servedLibraries> => {
  release ??= servedLibraries()
  return release
}
let development: ReturnType<typeof developedLibraries> | undefined
const developed = (): ReturnType<typeof developedLibraries> => {
  development ??= developedLibraries()
  return development
}

/** The text of a screen file of the project, as the build counts its characters: with one line ending. */
const screenText = (file: string): string =>
  readFileSync(join(import.meta.dirname, 'libraries', 'screens', file), 'utf8').replace(/\r\n?/g, '\n')

/** The line of a file that holds a piece of it, counted from 1. */
const lineOf = (text: string, piece: string): number => text.slice(0, text.indexOf(piece)).split('\n').length

/** What the content policy of the page refused, as a browser tells it to the page. */
async function refusedOf(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const refused: string[] = []
    Reflect.set(window, 'refusedByPolicy', refused)
    document.addEventListener('securitypolicyviolation', (event) =>
      refused.push(`${event.effectiveDirective} ${event.blockedURI}`),
    )
  })
  return () => page.evaluate(() => [...Reflect.get(window, 'refusedByPolicy')])
}

test('[43-3] the check passes on the project of the four libraries: an import of a style file and the nonce of the page pass the type checker', async () => {
  const folder = laidLibraries('checked')
  const checked = await typed(folder, 'check', '--json')
  assert.equal(checked.ended, 0, checked.printed)
  assert.deepEqual(
    checked.answer.findings?.filter((one) => one.level === 'error'),
    [],
  )
})

for (const engine of browserEngines) {
  test(`[43-3] the first HTML of a screen of a library holds its styles, its own style tags let in by the nonce of the page, with no 'unsafe-inline' in the content policy, in ${engine}`, async () => {
    const { address } = await released()
    for (const path of ['/mantine', '/tailwind', '/mui'])
      await inBrowser(engine, async (page) => {
        const refused = await refusedOf(page)
        // The page code is refused, so that only the first HTML and its style files draw.
        await page.route('**/_t/b/browser/**/*.js', (route) => route.abort())
        const answer = await page.goto(`${address}${path}`)
        const policy = String(answer?.headers()['content-security-policy'])
        const styles = /(?:^|; )style-src ([^;]*)/.exec(policy)?.[1] ?? ''
        assert.doesNotMatch(styles, /'unsafe-inline'/, `${path}: ${policy}`)
        assert.match(styles, /'nonce-[A-Za-z0-9+/=_-]{16,}'/, `${path}: the nonce of the page`)
        await page.waitForLoadState('load')
        const styled = await styledOf(page)
        assert.deepEqual(Object.keys(styled).sort(), [...watched].sort(), `${path}: every element is drawn`)
        assert.deepEqual(
          Object.entries(styled).filter(([, has]) => !has),
          [],
          `${path}: each element has the look of its library in the first HTML`,
        )
        assert.deepEqual(
          (await refused()).filter((one) => one.startsWith('style')),
          [],
          `${path}: no style is refused`,
        )
      })
  })

  test(`[43-3] nothing on the page of a library moves, and no look changes, when it comes alive, in ${engine}`, async () => {
    const { address } = await released()
    for (const path of libraryScreens)
      await inBrowser(engine, async (page) => {
        const moves = await movesOf(page)
        await page.goto(`${address}${path}`)
        await page.locator('#tent[data-t-alive]').waitFor()
        const { moved, changed } = await moves()
        assert.ok(moved <= 0.5, `${path}: an element moved ${moved} px`)
        assert.deepEqual(changed, [], `${path}: the look of these changed`)
      })
  })

  test(`[43-3] the inspect mode points at the line of the screen that used a component of a library, in ${engine}`, async () => {
    const { address, dev } = await developed()
    const tool = await frameTool()
    for (const [path, screen, file, piece] of [
      ['/mantine', 'mantineScreen', 'mantine.tsx', '<Button id="lib-button"'],
      ['/mui', 'muiScreen', 'mui.tsx', '<Button id="lib-button"'],
      ['/tailwind', 'tailwindScreen', 'tailwind.tsx', '<button id="lib-button"'],
      ['/charts', 'chartsScreen', 'charts.tsx', '<BarChart id="lib-chart"'],
    ] as const)
      await inBrowser(
        engine,
        async (page) => {
          const token = dev.app().inspect({ framedBy: new URL(tool).origin })
          await page.goto(`${tool}/?src=${encodeURIComponent(`${address}${path}?t-inspect=${token}`)}`)
          await toldBy(page, `${screen} is ready`, (one) => one.t === 'tent.ready' && one.screen === screen)
          const frame = page.frames().find((one) => one !== page.mainFrame())
          assert.ok(frame, 'the tool holds the frame of the app')
          const id = piece.includes('lib-chart') ? '.recharts-surface' : '#lib-button'
          const box = await frame.locator(id).first().boundingBox()
          assert.ok(box, `${path}: the element is drawn`)
          const at = (await page.locator('iframe').boundingBox()) ?? { x: 0, y: 0 }
          await page.mouse.move(at.x + box.x + box.width / 2, at.y + box.y + box.height / 2)
          const over = await toldBy(page, `${path}: the pointer is over an element of ${file}`, (one) => {
            const place = Object(Object(one.element).place)
            return one.t === 'tent.over' && String(place.file).endsWith(`screens/${file}`)
          })
          const place = Object(Object(over.element).place)
          const text = screenText(file)
          const written = text.indexOf(piece)
          assert.ok(
            place.from <= written && written < place.to,
            `${path}: the place ${place.from}..${place.to} holds the tag written at ${written}`,
          )
        },
        { width: 1000, height: 800 },
      )
  })

  test(`[43-3] the failure overlay points at the line of the screen for a fault inside a library, on the server and in the browser, with the library's own lines folded as the library's, in ${engine}`, async () => {
    const { address } = await developed()
    for (const [path, file, piece, library] of [
      ['/mantine-fault', 'mantine.tsx', '<Button id="lib-fault"', '@mantine/core'],
      ['/charts-fault', 'charts.tsx', '<BarChart id="lib-fault"', 'recharts'],
    ] as const)
      await inBrowser(engine, async (page) => {
        await page.goto(`${address}${path}`)
        const overlay = page.locator('#tent-overlay')
        await overlay.waitFor()
        const line = lineOf(screenText(file), piece)
        const shown = page.locator('#tent-overlay p', { hasText: `screens/${file}:${line}` })
        await shown.first().waitFor()
        const told = await shown.first().innerText()
        // The calls of the library are folded as its own, and never as the framework's, wherever its folder lies.
        assert.match(told, new RegExp(`in the package ${library.replace('/', '\\/')}, `), `${path}: ${told}`)
      })
  })
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

/** Waits until a session runs another version than the one it ran: a save of a file has been built and switched to. */
async function switchedFrom(dev: { version(): string }, was: string): Promise<void> {
  for (let n = 0; n < 12000 && dev.version() === was; n++) await new Promise((done) => setTimeout(done, 10))
  assert.notEqual(dev.version(), was, 'the save was switched to')
}

test('[43-3] a save of one screen of a library shows within save.seen, and a save back to the text the page started with is shown too', async () => {
  const { address, dev } = await developed()
  const file = join(dev.folder, 'screens', 'mantine.tsx')
  const first = readFileSync(file, 'utf8')
  try {
    await inBrowser('chromium', async (page) => {
      await page.goto(`${address}/mantine`)
      await page.locator('#tent[data-t-alive]').waitFor()
      let round = 0
      const saved = async (): Promise<void> => {
        const words = `Mantine heading, saved ${++round}`
        const seen = shows(page, words)
        writeFileSync(file, first.replace('Mantine heading', words))
        await seen
      }
      await measure('save.seen', saved, { unit: 'ms', warm: true })
      // The text the page started with is a version that was built before: it is shown again all the same.
      const was = dev.version()
      writeFileSync(file, first)
      await switchedFrom(dev, was)
      await page.locator('#lib-heading', { hasText: /^Mantine heading$/ }).waitFor()
    })
  } finally {
    writeFileSync(file, first)
  }
})

test('[43-3] the memory of tent dev does not grow by more than 300 MB across fifty saves of a screen of a library', async () => {
  const { dev } = await developed()
  const file = join(dev.folder, 'screens', 'mantine.tsx')
  const first = readFileSync(file, 'utf8')
  try {
    // One save first, so that what a save loads once is loaded before the memory is read.
    const saved = async (round: number): Promise<void> => {
      const was = dev.version()
      writeFileSync(file, first.replace('Mantine heading', `Mantine heading, saved ${round}`))
      await switchedFrom(dev, was)
    }
    await saved(0)
    const before = process.memoryUsage.rss()
    for (let round = 1; round <= 50; round++) await saved(round)
    const grown = process.memoryUsage.rss() - before
    assert.ok(grown <= 300 * 1024 * 1024, `the memory grew by ${Math.round(grown / 1024 / 1024)} MB`)
  } finally {
    writeFileSync(file, first)
  }
})
