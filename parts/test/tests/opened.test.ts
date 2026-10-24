import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { TentError } from '../../core/index.ts'
import type { BrowserEngine } from '../../engine/index.ts'
import { testApp } from '../index.ts'
import { engineOf } from '../page.ts'
import { closing, copyOf } from './projects.ts'

// The runner ends a test that is held past this, whatever holds it, and the test's own closing then ends its browsers.
const held = { timeout: 180_000 }

/** Whether a failure is a `TentError` of that code whose words hold each of the texts. */
const failedWith =
  (code: string, ...texts: string[]) =>
  (error: unknown): boolean => {
    assert.ok(error instanceof TentError, String(error))
    assert.equal(error.code, code, error.message)
    for (const text of texts) assert.ok(error.message.includes(text), `${JSON.stringify(text)} in: ${error.message}`)
    return true
  }

/** Whether a failure says that the engine is not driven on this computer, so that a test in it is not run. */
const notRun = (error: unknown): boolean =>
  error instanceof TentError &&
  error.code === 'T0016' &&
  error.fields?.engine === 'notRun' &&
  /BiDi/.test(error.message)

/**
 * Signs in as a test user in one engine, finds a field, a press and a row by name, sends a form and holds the new row
 * in the live list. Answers false where the engine is not driven on this computer, and the test in it is not run.
 */
async function shelved(t: TestContext, engine: BrowserEngine): Promise<boolean> {
  const app = await testApp({ folder: copyOf(t, 'opened') })
  closing(t, () => app.close())
  const ada = await app.user({ name: 'Ada', roles: [] })
  const page = await app.open('/orders', { as: ada, engine }).catch((error: unknown) => {
    if (notRun(error)) return undefined
    throw error
  })
  if (!page) return false
  assert.equal(engineOf(page), engine)
  // The screen needs a signed-in user: it is shown, so the page is Ada's.
  assert.equal((await page.text('0 orders')).text, '0 orders')
  const title = await page.field('title')
  assert.equal(title.value, '')
  assert.equal(title.name, 'Title')
  await page.type('title', 'A shelf')
  assert.equal((await page.field('title')).value, 'A shelf')
  // The press answers once its call was answered and the live list holds the row: the row is there at once.
  await page.press('Save')
  const [shelf] = (await app.rows('orders')).filter((one) => one.title === 'A shelf')
  assert.ok(shelf)
  assert.equal((await page.block(`order-${shelf.id}`)).text, 'A shelf')
  assert.equal((await page.text('1 orders')).text, '1 orders')
  assert.match((await page.block('orderList')).text, /A shelf/)
  return true
}

test(
  '[48-1] a test with app.open signs in as a test user, finds a field, a press and a row by name, sends a form and holds the new row in a live list, in Chromium, with no wait by time',
  held,
  async (t) => {
    assert.equal(await shelved(t, 'chromium'), true)
  },
)

test(
  '[48-1] the same test in Firefox and WebKit runs where they speak WebDriver BiDi, and is named as not run where they do not',
  held,
  async (t) => {
    // Firefox speaks WebDriver BiDi on every system.
    assert.equal(await shelved(t, 'firefox'), true)
    // WebKit speaks it where its driver does: elsewhere the opening says so, and the test is not run.
    const ran = await shelved(t, 'webkit')
    if (!ran) t.diagnostic('webkit: not run, it does not speak WebDriver BiDi on this computer')
  },
)

test(
  '[48-1] a name that finds nothing fails at once and names what it looked for and what the screen holds, and one that finds two fails the same way',
  held,
  async (t) => {
    const app = await testApp({ folder: copyOf(t, 'opened') })
    closing(t, () => app.close())
    const ada = await app.user({ name: 'Ada', roles: [] })
    const page = await app.open('/orders', { as: ada })
    await assert.rejects(page.press('Delete all'), failedWith('T0001', 'Delete all', 'Save', 'Add later', 'Never'))
    await assert.rejects(page.field('price'), failedWith('T0001', 'price', 'title'))
    await assert.rejects(page.block('nowhere'), failedWith('T0001', 'nowhere', 'orderList'))
    await assert.rejects(page.text('Not on the screen'), failedWith('T0001', 'Not on the screen'))
    await assert.rejects(page.press('Twin'), failedWith('T0002', 'Twin', 'two'))
    // Nothing was pressed: the list is as it was.
    assert.deepEqual(await app.rows('orders'), [])
  },
)
