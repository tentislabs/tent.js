import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Browsed, BrowserEngine } from '../index.ts'
import { browsed } from '../index.ts'
import { startedBrowsers } from '../shot/driven.ts'
import { running } from './apps.ts'

/** Whether a program of this computer runs, by its number. */
const runs = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const opening = (engine: BrowserEngine, preload?: string) => ({
  engine,
  size: { width: 400, height: 300 },
  dark: false,
  ...(preload === undefined ? {} : { preload }),
})

/** Loads the health of the app in a page, and answers once the page shows it. */
async function shown(page: Browsed, origin: string): Promise<void> {
  await page.go(`${origin}/_t/health`)
  while ((await page.evaluate("document.readyState === 'complete' && location.origin")) !== origin)
    await new Promise((done) => setTimeout(done, 50))
}

/** What a page holds of its own: a cookie, a stored value and what its first script set. */
const heldBy = (page: Browsed): Promise<unknown> =>
  page.evaluate(
    "({ cookie: document.cookie.includes('mine=1'), stored: localStorage.getItem('mine'), mark: window.mark ?? null })",
  )

test('[54-6] two pages of app.open in Chromium in one program start one browser, each a context of its own: a cookie, a stored value and a first script of one are not seen in the other, and ending one leaves the other working', {
  timeout: 300_000,
}, async (t) => {
  const { app, origin } = await running(t)
  const before = startedBrowsers().length
  const one = await browsed(app, opening('chromium', "() => { window.mark = 'one' }"))
  const other = await browsed(app, opening('chromium'))
  t.after(() => Promise.all([one.end(), other.end()]))
  assert.equal(startedBrowsers().length - before, 1, 'one browser serves both pages')
  for (const page of [one, other]) await shown(page, origin)
  await one.evaluate("(document.cookie = 'mine=1', localStorage.setItem('mine', '1'), 1)")
  assert.deepEqual(await heldBy(one), { cookie: true, stored: '1', mark: 'one' })
  assert.deepEqual(await heldBy(other), { cookie: false, stored: null, mark: null })
  await one.end()
  assert.equal(await other.evaluate('1 + 1'), 2, 'the other page works on')
})

test('[54-6] a browser of the program that was ended is started again at the next page', {
  timeout: 300_000,
}, async (t) => {
  const { app, origin } = await running(t)
  const first = await browsed(app, opening('chromium'))
  const [browser] = startedBrowsers()
    .filter((one) => !one.ended)
    .slice(-1)
  assert.ok(browser, 'a browser runs')
  process.kill(browser.pid)
  await assert.rejects(first.evaluate('1'))
  const next = await browsed(app, opening('chromium'))
  t.after(() => next.end())
  await shown(next, origin)
  assert.equal(await next.evaluate('1 + 1'), 2)
  assert.ok(startedBrowsers().at(-1)?.pid !== browser.pid, 'another browser serves the next page')
})

test('[54-6] the browser ends with its program, and none is left', { timeout: 300_000 }, () => {
  const folder = mkdtempSync(join(tmpdir(), 'tent-left-'))
  try {
    const at = join(folder, 'browsers.json')
    const { NODE_TEST_CONTEXT: _, ...env } = process.env
    const ended = spawnSync(process.execPath, ['--test', join(import.meta.dirname, 'driven', 'left.test.ts')], {
      encoding: 'utf8',
      timeout: 240_000,
      env: { ...env, TENT_BROWSER_AT: at },
    })
    assert.equal(ended.status, 0, `${ended.stdout}${ended.stderr}`)
    const browsers: { pid: number }[] = JSON.parse(readFileSync(at, 'utf8'))
    assert.equal(browsers.length, 1, 'one browser served the two pages')
    assert.ok(!runs(browsers[0].pid), 'the browser ended with its program')
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('[54-6] pages of Firefox start a browser each, as before', { timeout: 300_000 }, async (t) => {
  const { app } = await running(t)
  // The folders of passing files are this program's own while its pages start: a browser that another program of the
  // run starts at the same time is never counted.
  const own = mkdtempSync(join(tmpdir(), 'tent-pages-'))
  const words = ['TMPDIR', 'TEMP', 'TMP'].map((word) => [word, process.env[word]] as const)
  for (const [word] of words) process.env[word] = own
  const pages: Browsed[] = []
  try {
    for (let n = 0; n < 2; n++) pages.push(await browsed(app, opening('firefox')))
  } finally {
    for (const [word, value] of words)
      if (value === undefined) delete process.env[word]
      else process.env[word] = value
  }
  t.after(async () => {
    await Promise.all(pages.map((one) => one.end()))
    rmSync(own, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 })
  })
  assert.equal(readdirSync(own).filter((name) => name.startsWith('tent-firefox-')).length, 2)
})
