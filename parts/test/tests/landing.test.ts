import assert from 'node:assert/strict'
import test from 'node:test'
import { browserEngines } from '../../../rig/browser.ts'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { BrowserEngine } from '../../engine/index.ts'
import type { Page, TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closePage } from '../page.ts'
import { listened } from './probe.ts'
import { closing, copyOf } from './projects.ts'

const moment = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** The page of the orders in one engine as that user, or nothing where WebKit does not speak WebDriver BiDi here. */
async function ordersIn(app: TestApp, engine: BrowserEngine, as: Caller): Promise<Page | undefined> {
  return app.open('/orders', { as, engine }).catch((error: unknown) => {
    if (error instanceof TentError && error.fields?.engine === 'notRun' && engine === 'webkit') return undefined
    throw error
  })
}

test('[48-2] a press whose call answers late is waited for exactly, by the record that the page keeps', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'opened') })
  closing(t, () => app.close())
  const ada = await app.user({ name: 'Ada', roles: [] })
  // The gate of the action: it tells the test that the call arrived, and holds the answer until the test lets it go.
  let gate = { enter: (): void => undefined, held: Promise.resolve() }
  listened(t, 'tentjs.test.landing', async () => {
    gate.enter()
    await gate.held
  })
  for (const engine of browserEngines) {
    const page = await ordersIn(app, engine, ada)
    if (!page) continue
    let enter = (): void => undefined
    const entered = new Promise<void>((done) => {
      enter = done
    })
    let release = (): void => undefined
    const held = new Promise<void>((done) => {
      release = done
    })
    gate = { enter, held }
    let landed = false
    const pressed = page.press('Add later').then(() => {
      landed = true
    })
    await entered
    // The call is held by the app: the press has not landed, however long the test looks.
    await moment(500)
    assert.equal(landed, false, engine)
    release()
    await pressed
    const later = (await app.rows('orders')).filter((one) => one.title === 'Later')
    assert.ok(later.length, `the action wrote its row in ${engine}`)
    // The step that answered has landed the row, so a finding fails at once if it is not there.
    for (const one of later) assert.equal((await page.block(`order-${one.id}`)).text, 'Later', engine)
    await closePage(page)
  }
})

test('[48-2] a write that reaches the page through its watch is waited for exactly, by the record that the page keeps', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'opened') })
  closing(t, () => app.close())
  const ada = await app.user({ name: 'Ada', roles: [] })
  for (const engine of browserEngines) {
    const page = await ordersIn(app, engine, ada)
    if (!page) continue
    for (const title of [`From afar in ${engine}`, `Further in ${engine}`]) {
      const made = await app.write([{ add: 'orders', values: { title } }], { as: 'system' })
      const id = String(Reflect.get(Object(Object(made)[0]), 'id'))
      // The next step waits until the watch of the list holds the write, and finds the row at once.
      assert.equal((await page.block(`order-${id}`)).text, title)
    }
    const count = (await app.rows('orders')).length
    assert.equal((await page.text(`${count} orders`)).text, `${count} orders`, engine)
    await closePage(page)
  }
})

test('[48-2] a step that never lands fails after testStep, naming what it still waited for', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'opened') })
  closing(t, () => app.close())
  const ada = await app.user({ name: 'Ada', roles: [] })
  for (const engine of browserEngines) {
    const page = await ordersIn(app, engine, ada)
    if (!page) continue
    const started = performance.now()
    await assert.rejects(page.press('Never'), (error) => {
      assert.ok(error instanceof TentError, String(error))
      assert.equal(error.code, 'T0008', engine)
      assert.match(error.message, /5 seconds/)
      assert.match(error.message, /\/_t\/call\/never/)
      return true
    })
    // The project bounds a step at five seconds.
    assert.ok(performance.now() - started >= 5000, `the step was given its time in ${engine}`)
    await closePage(page)
  }
})
