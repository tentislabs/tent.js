import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { browserEngines, browsersStarted, inBrowser, picturesIn } from '../rig/browser.ts'
import { root } from './rigs-plant.ts'

/** A server of this computer whose page runs a script that names itself in the title of the page. */
async function served(t: TestContext): Promise<string> {
  const server = createServer((_, answer) => {
    answer.writeHead(200, { 'content-type': 'text/html' })
    answer.end("<html><head><title></title></head><body><script>document.title = 'ran'</script></body></html>")
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(() => server.close())
  return `http://127.0.0.1:${Object(server.address()).port}/`
}

/** Starts a test file of its own program, as a test file of the runs is started, and answers how it ended. */
function ranApart(file: string, env: Record<string, string> = {}): { code: number | null; out: string } {
  const { NODE_TEST_CONTEXT: _, ...handed } = process.env
  const ended = spawnSync(process.execPath, ['--test', file], {
    cwd: root,
    encoding: 'utf8',
    timeout: 300_000,
    env: { ...handed, ...env },
  })
  return { code: ended.status, out: `${ended.stdout}${ended.stderr}` }
}

test('[54-4] a test file that calls inBrowser in each engine several times starts one browser of each engine in its program, a context of its own for each call with every setting it gives, and leaves none once its program ends', async (t) => {
  const page = await served(t)
  for (const engine of browserEngines) {
    const before = browsersStarted()[engine]
    await inBrowser(engine, async (one) => {
      await one.context().addCookies([{ name: 'kept', value: '1', url: page }])
      await one.goto(page)
      await one.evaluate(() => localStorage.setItem('kept', '1'))
    })
    const seen = await inBrowser(engine, async (one) => {
      await one.goto(page)
      return one.evaluate(async () => ({
        cookie: document.cookie,
        stored: localStorage.getItem('kept'),
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        size: [innerWidth, innerHeight],
        title: document.title,
        cut: await fetch('http://example.com/').then(
          () => 'reached',
          () => 'cut',
        ),
      }))
    })
    // What the call before kept is no part of this one; the zone, the size, scripts and the cut-off hold in each.
    assert.deepEqual(
      seen,
      { cookie: '', stored: null, zone: 'Asia/Tokyo', size: [800, 600], title: 'ran', cut: 'cut' },
      engine,
    )
    const unscripted = await inBrowser(
      engine,
      async (one) => {
        await one.goto(page)
        return [await one.title(), await one.evaluate(() => [innerWidth, innerHeight])]
      },
      { scripts: false, width: 400, height: 300 },
    )
    assert.deepEqual(unscripted, ['', [400, 300]], engine)
    assert.equal(browsersStarted()[engine] - before, 1, `one browser of ${engine} served every call`)
  }
  // A program that used them and closed none ends, and leaves none.
  const apart = ranApart('tests/planted/browsers/kept.test.ts')
  assert.equal(apart.code, 0, apart.out)
})

test('[54-4] a browser of the program ended in the middle of a call is started again at the next call, and only the call that lost it fails', async () => {
  for (const engine of browserEngines) {
    await inBrowser(engine, (one) => one.evaluate(() => 1))
    const before = browsersStarted()[engine]
    await assert.rejects(
      inBrowser(engine, async (one) => {
        await one.context().browser()?.close()
        return one.evaluate(() => 1)
      }),
    )
    assert.equal(await inBrowser(engine, (one) => one.evaluate(() => 1 + 1)), 2, engine)
    assert.equal(browsersStarted()[engine] - before, 1, `${engine} was started again once`)
  }
})

test('[54-5] a picture taken in a kept browser is the same, pixel for pixel, as one taken in a browser of its own', async (t) => {
  const folder = mkdtempSync(join(root, 'results', 'kept-pictures-'))
  mkdirSync(folder, { recursive: true })
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  // Its own: a program that took nothing before.
  const apart = ranApart('tests/planted/browsers/kept.test.ts', { TENT_PICTURE_AT: join(folder, 'apart') })
  assert.equal(apart.code, 0, apart.out)
  for (const engine of browserEngines) {
    // Kept: this program's browser, after other calls in it.
    await inBrowser(engine, (one) => one.evaluate(() => 1))
    const kept = await picturesIn(engine, (take) => take('<p>Kept</p>', { width: 120, height: 60 }))
    assert.deepEqual(Buffer.from(kept), readFileSync(join(folder, `apart.${engine}.png`)), engine)
  }
})
