import assert from 'node:assert/strict'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { buildProject } from '../../build/index.ts'
import { openedAlive } from './browsing.ts'
import type { Heard } from './remotes.ts'
import { answerJson, remoteOf } from './remotes.ts'
import type { Served } from './served.ts'
import { served } from './served.ts'

/** The rows of the table `vitals` of the log, as they stand. */
function vitalsOf(at: Served): Record<string, unknown>[] {
  const log = new DatabaseSync(join(at.dataFolder, 'logs.db'), { readOnly: true })
  try {
    return log.prepare('SELECT * FROM vitals').all()
  } finally {
    log.close()
  }
}

/** The names of the columns of the table `vitals`. */
function columnsOf(at: Served): string[] {
  const log = new DatabaseSync(join(at.dataFolder, 'logs.db'), { readOnly: true })
  try {
    return log
      .prepare('SELECT name FROM pragma_table_info(?)')
      .all('vitals')
      .map((row) => String(row.name))
  } finally {
    log.close()
  }
}

/** Waits until what is asked holds, and fails the test once the time is up. */
async function until(what: string, holds: () => boolean | Promise<boolean>, within = 15_000): Promise<void> {
  const ends = performance.now() + within
  while (!(await holds())) {
    assert.ok(performance.now() < ends, `never: ${what}`)
    await new Promise((done) => setTimeout(done, 100))
  }
}

/** The version that runs. */
const running = (at: Served): string => String(at.app.versions().find((one) => one.running)?.id)

/** Sends measures to `/_t/vitals` as a page of the app does, or from another origin. */
const sent = (at: Served, body: unknown, origin = at.address): Promise<Response> =>
  fetch(`${at.address}/_t/vitals`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', origin },
    body: JSON.stringify(body),
  })

const measured = (version: string, screen: string, measure: string, value: number) => ({
  version,
  width: 1280,
  connection: '4g',
  measures: [{ screen, measure, value }],
})

test('[44-7] a page view in the three browsers sends its measures when it is hidden, with nothing that names the visitor; the part that measures loads when the browser is idle; the measures go out as metrics', async (t) => {
  const otlp = await remoteOf(t, (_: Heard, response) => answerJson(response, 200, {}))
  const at = await served('vitals', { for: 'dev' })
  await at.app.values({ kind: 'setting', name: 'otlpUrl', value: otlp.origin })
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      const before = vitalsOf(at).length
      const asked: string[] = []
      page.on('request', (request) => asked.push(request.url()))
      const html = await (await fetch(`${at.address}/`)).text()
      assert.doesNotMatch(html, /vitals[^"/]*\.js/, `the first HTML names no file of the part that measures ${said}`)
      await openedAlive(page, `${at.address}/`)
      await page.waitForTimeout(300)
      await page.getByRole('link', { name: 'To the second screen' }).click()
      await page.getByRole('heading', { name: 'The second screen' }).waitFor()
      await until(`the part that measures was loaded, in ${engine}`, () =>
        asked.some((url) => /vitals[^/]*\.js$/.test(url)),
      )
      // The page is hidden: it sends what it measured, once. The part may hear only once it has run, a moment after
      // it was asked for, so the page is told it is hidden again until the measures come; it sends them once all
      // the same. A beacon, and its row, reach the log as the computer has time: some seconds on a busy one.
      await until(`the measures stand in the log, in ${engine}`, async () => {
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
          document.dispatchEvent(new Event('visibilitychange'))
        })
        return vitalsOf(at).length > before
      })
      const rows = vitalsOf(at).slice(before)
      const of = (screen: string, measure: string) =>
        rows.filter((row) => row.screen === screen && row.measure === measure)
      assert.equal(of('homeScreen', 'ttfb').length, 1, said)
      assert.equal(of('secondScreen', 'move').length, 1, said)
      if (engine === 'chromium') assert.equal(of('homeScreen', 'lcp').length, 1, said)
      // The browsers of the tests have a window 800 wide, which is a tablet's.
      assert.ok(
        rows.every((row) => row.version === running(at) && row.device === 'tablet'),
        said,
      )
    })
  // The table holds nothing that says whose visit it was.
  assert.deepEqual(columnsOf(at).sort(), ['at', 'connection', 'device', 'measure', 'screen', 'value', 'version'])
  // With `trace.otlp` set, each measure goes out as a metric of its screen and version.
  await until('the measures were sent out', () => otlp.heard.some((heard) => heard.path === '/v1/metrics'))
  const metrics = otlp.heard
    .filter((heard) => heard.path === '/v1/metrics')
    .map((heard) => heard.body.toString())
    .join('\n')
  assert.match(metrics, /"tent\.vitals\.ttfb"/)
  assert.match(metrics, /"screen"[^}]*"homeScreen"/)
  assert.match(metrics, new RegExp(`"version"[^}]*"${running(at)}"`))
})

test('[44-7] /_t/vitals drops a value out of its range, a request from another origin and the sixty-first of a minute from one address, and answers 204 alike', async () => {
  const at = await served('vitals', { for: 'dev' })
  const version = running(at)
  // A burst stands in one minute of the count.
  while (new Date().getSeconds() > 40) await new Promise((done) => setTimeout(done, 500))
  const out = await sent(at, measured(version, 'homeScreen', 'cls', 99))
  const negative = await sent(at, measured(version, 'homeScreen', 'lcp', -5))
  const other = await sent(at, measured(version, 'homeScreen', 'ttfb', 120), 'https://evil.example')
  const unknown = await sent(at, measured(version, 'noScreen', 'ttfb', 120))
  assert.deepEqual([out.status, negative.status, other.status, unknown.status], [204, 204, 204, 204])
  assert.equal(vitalsOf(at).length, 0)
  const statuses: number[] = []
  for (let n = 0; n < 61; n++) statuses.push((await sent(at, measured(version, 'homeScreen', 'ttfb', 100 + n))).status)
  assert.ok(statuses.every((status) => status === 204))
  // Every request from the address of the app counts, one that was dropped too: three of them came first.
  assert.equal(vitalsOf(at).length, 60 - 3)
})

test('[44-7] app.logs with vitals ranks the screens furthest past the line of good first, and holds each version beside the one before', async () => {
  const at = await served('vitals', { for: 'dev' })
  const first = running(at)
  await sent(at, measured(first, 'homeScreen', 'ttfb', 3000))
  await sent(at, measured(first, 'secondScreen', 'ttfb', 100))
  // A second version, to which the app switches.
  const next = join(at.dataFolder, '..', 'next')
  cpSync(join(import.meta.dirname, 'vitals'), next, { recursive: true })
  const file = join(next, 'screens.tsx')
  writeFileSync(file, readFileSync(file, 'utf8').replace('The second screen', 'The second screen anew'))
  const made = await buildProject(next, { for: 'dev', out: join(next, 'bundle') })
  const second = await at.app.add(made.bundleFolder)
  await at.app.switch(second)
  await sent(at, measured(second, 'homeScreen', 'ttfb', 1200))
  await until('the measures stand in the log', () => vitalsOf(at).length === 3)
  const { vitals } = Object(await at.app.logs({ vitals: true }))
  assert.ok(Array.isArray(vitals), JSON.stringify(vitals))
  // The screen furthest past its line comes first: the home screen of the first version, at 3000 over 800.
  assert.deepEqual(
    vitals.map((one: { screen: string; version: string }) => [one.screen, one.version]),
    [
      ['homeScreen', first],
      ['homeScreen', second],
      ['secondScreen', first],
    ],
  )
  const [, now] = vitals
  assert.equal(now.before, first)
  assert.deepEqual(now.measures.ttfb, { p75: 1200, good: 800, count: 1, before: 3000 })
})
