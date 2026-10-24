import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { TentError } from '../../core/index.ts'
import { createEngine } from '../../engine/index.ts'
import { expect, testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

/** The port that the engine of a data folder answers on, as it wrote it. */
const portOf = (data: string): number => Number(JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port)

test('[48-3] app.clock.advance moves the clock of every page the app has open: a screen that counts down three days shows the end', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'looked') })
  closing(t, () => app.close())
  const hour = 3_600_000
  await app.write([{ add: 'deals', values: { title: 'The sale', endsAt: new Date(Date.now() + 72 * hour - hour) } }], {
    as: 'system',
  })
  const page = await app.open('/deals')
  assert.equal((await page.text('The sale ends in 3 days')).text, 'The sale ends in 3 days')
  app.clock.advance('3 days')
  assert.equal((await page.text('The sale has ended')).text, 'The sale has ended')
  // A page opened after the move starts at the time the app stands at.
  const later = await app.open('/deals')
  assert.equal((await later.text('The sale has ended')).text, 'The sale has ended')
})

test('[48-4] a failed step leaves a picture, the console, the tree of the reader and the trace ids, and the trace opens', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'looked') })
  closing(t, () => app.close())
  const page = await app.open('/plain')
  const failed = await page.press('Never').then(
    () => undefined,
    (error: unknown) => error,
  )
  assert.ok(failed instanceof TentError, String(failed))
  assert.equal(failed.code, 'T0008')
  const kept = String(Reflect.get(failed, 'kept'))
  assert.ok(failed.message.includes('results/tests/'), failed.message)
  for (const file of ['picture.png', 'console.txt', 'reader.txt', 'traces.txt'])
    assert.ok(existsSync(join(kept, file)), `${file} is kept`)
  assert.deepEqual([...readFileSync(join(kept, 'picture.png')).subarray(1, 4)], [0x50, 0x4e, 0x47])
  assert.match(readFileSync(join(kept, 'reader.txt'), 'utf8'), /heading "A plain page"/)
  const [trace] = readFileSync(join(kept, 'traces.txt'), 'utf8').split(/\s/)
  assert.match(trace, /^[0-9a-f]{32}$/)
  // The trace of the call that never answered opens as its tree.
  const tree: Record<string, unknown> = await app.logs({ trace })
  assert.equal(tree.trace, trace)
  assert.ok(Array.isArray(tree.spans) && tree.spans.length > 0, 'the tree holds spans')
  // A finding that fails leaves the same.
  const missing = await page.press('Nowhere').then(
    () => undefined,
    (error: unknown) => error,
  )
  assert.ok(missing instanceof TentError && missing.code === 'T0001' && missing.message.includes('picture.png'))
})

test('[48-5] looks passes on the same page, fails on a moved element, and writes an unapproved picture beside', async (t) => {
  const folder = copyOf(t, 'looked')
  const app = await testApp({ folder })
  closing(t, () => app.close())
  const page = await app.open('/plain', { size: [400, 300] })
  const kept = join(folder, 'tests', 'looks', 'chromium', 'plain.png')
  const fresh = join(folder, 'tests', 'looks', 'chromium', 'plain.new.png')
  // With no picture kept the page is not approved, and its picture is written beside.
  await assert.rejects(
    expect(page).looks('plain'),
    (error) => error instanceof TentError && /not approved/.test(error.message),
  )
  assert.ok(existsSync(fresh))
  renameSync(fresh, kept)
  await expect(page).looks('plain')
  await page.press('Move')
  await assert.rejects(
    expect(page).looks('plain'),
    (error) => error instanceof TentError && /pixels differ/.test(error.message),
  )
  assert.ok(existsSync(fresh), 'the moved page is written beside')
  // Within a share large enough the moved page passes.
  await expect(page).looks('plain', { share: 1 })
})

test('[48-5] heard passes on the same page and fails where the reader hears another, writing what it heard beside', async (t) => {
  const folder = copyOf(t, 'looked')
  const app = await testApp({ folder })
  closing(t, () => app.close())
  const page = await app.open('/plain')
  const kept = join(folder, 'tests', 'heard', 'chromium', 'plain.txt')
  const fresh = join(folder, 'tests', 'heard', 'chromium', 'plain.new.txt')
  await assert.rejects(
    expect(page).heard('plain'),
    (error) => error instanceof TentError && /not approved/.test(error.message),
  )
  assert.match(readFileSync(fresh, 'utf8'), /heading "A plain page"/)
  renameSync(fresh, kept)
  await expect(page).heard('plain')
  // What a reader hears is the page as it is now: other words fail.
  const other = await app.open('/badge')
  await assert.rejects(
    expect(other).heard('plain'),
    (error) => error instanceof TentError && /does not hear/.test(error.message),
  )
  assert.ok(existsSync(fresh))
})

test('[48-6] a component opened with props draws alone in the test mode at /_t/part/ with no path', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'looked') })
  closing(t, () => app.close())
  // A test of an app imports its component; this one names it as the definition does.
  const Badge = { definition: 'Badge', kind: 'component' } as const
  const page = await app.open(Badge, { props: { label: 'Alone' } })
  assert.equal((await page.text('Alone')).text, 'Alone')
  assert.match((await page.block('badge')).text, /Alone/)
  // Nothing of a screen is drawn around it.
  assert.doesNotMatch(await page.reader(), /heading/)
  // Its props are held to its declared types.
  await assert.rejects(app.open(Badge, { props: { label: 3 } }), (error) => error instanceof TentError)
})

test('[48-6] /_t/part/ with no path answers 404 outside the mode test, in development and on live data', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'tent-part-'))
  t.after(() => rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const built = await buildProject(copyOf(t, 'looked'), { for: 'dev', out: join(home, 'bundle') })
  for (const mode of ['development', 'live'] as const) {
    const engine = createEngine({ port: 0 })
    try {
      const app = await engine.open(built.bundleFolder, { dataFolder: join(home, mode), mode })
      const props = encodeURIComponent(JSON.stringify({ label: 'Alone' }))
      const answer = await app.request(
        new Request(`http://localhost:${portOf(join(home, mode))}/_t/part/Badge?props=${props}`),
      )
      assert.equal(answer.status, 404, mode)
      assert.doesNotMatch(await answer.text(), /Alone/, mode)
    } finally {
      await engine.close()
    }
  }
})
