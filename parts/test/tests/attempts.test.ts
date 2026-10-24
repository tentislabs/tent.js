import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp, TestBrowser } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

const opened = async (t: test.TestContext): Promise<TestApp> => {
  const app = await testApp({ folder: copyOf(t, 'guarded') })
  closing(t, () => app.close())
  return app
}

/** What one guess of a browser answers: `ok` where it was counted, and the code of its refusal otherwise. */
async function triedAt(browser: TestBrowser, input: object, fn = 'guess'): Promise<string> {
  const told = await browser.call(fn, input)
  return told.ok ? 'ok' : String(told.error?.code)
}

test('[22-2] attempts.limit refuses the next try once its limit is reached, until its window ends', async (t) => {
  const app = await opened(t)
  const browser = app.browser()
  const input = { email: 'maya@example.com', tries: 3, per: '10 minutes' }
  // Three tries are counted, and one more is refused.
  assert.deepEqual(
    [await triedAt(browser, input), await triedAt(browser, input), await triedAt(browser, input)],
    ['ok', 'ok', 'ok'],
  )
  const over = await browser.call('guess', input)
  assert.deepEqual([over.ok, over.error?.code, over.error?.name], [false, 'T0005', 'rate-limited'])
  // The window starts at the first try: nine minutes after it the key is still refused, however long it kept still.
  app.clock.advance('9 minutes')
  assert.equal(await triedAt(browser, input), 'T0005')
  // When the window has ended the count starts anew.
  app.clock.advance('1 minute')
  assert.deepEqual(
    [await triedAt(browser, input), await triedAt(browser, input), await triedAt(browser, input)],
    ['ok', 'ok', 'ok'],
  )
  assert.equal(await triedAt(browser, input), 'T0005')
  // Another key has a count of its own.
  assert.equal(await triedAt(browser, { ...input, email: 'omar@example.com' }), 'ok')
})

test('[22-10] one try more than tries within the window is T0005, also when every try failed in its call; clear empties the count; with address: true two addresses count apart; inside a change it is T0013', async (t) => {
  const app = await opened(t)
  const [here, there] = [app.browser({ from: '203.0.113.5' }), app.browser({ from: '203.0.113.6' })]
  const input = { email: 'maya@example.com', tries: 2, per: '1 hour' }
  // A guess whose call fails afterwards was counted all the same: the count is a write of its own, made at once.
  assert.deepEqual(
    [await triedAt(here, input, 'wrongGuess'), await triedAt(here, input, 'wrongGuess')],
    ['wrong', 'wrong'],
  )
  assert.equal(await triedAt(here, input, 'wrongGuess'), 'T0005')
  assert.equal(await triedAt(here, input), 'T0005')
  // With no `address` the count is kept for the key alone: another address is refused with it.
  assert.equal(await triedAt(there, input), 'T0005')
  // `clear` empties the count, as after a sign-in that worked.
  assert.deepEqual(await here.call('forgive', { email: 'maya@example.com' }), { ok: true })
  assert.deepEqual(
    [await triedAt(here, input), await triedAt(here, input), await triedAt(here, input)],
    ['ok', 'ok', 'T0005'],
  )

  // With `address: true` the count is kept for the key and the address together.
  const byAddress = { email: 'omar@example.com', tries: 2, per: '1 hour', address: true }
  assert.deepEqual(
    [await triedAt(here, byAddress), await triedAt(here, byAddress), await triedAt(here, byAddress)],
    ['ok', 'ok', 'T0005'],
  )
  assert.deepEqual(
    [await triedAt(there, byAddress), await triedAt(there, byAddress), await triedAt(there, byAddress)],
    ['ok', 'ok', 'T0005'],
  )
  // The count of the key alone stands beside them, untouched by either.
  assert.equal(await triedAt(here, { ...byAddress, address: false }), 'ok')
  // `clear` with `address: true` empties the count of this address, and leaves that of the other.
  assert.deepEqual(await here.call('forgive', { email: 'omar@example.com', address: true }), { ok: true })
  assert.equal(await triedAt(here, byAddress), 'ok')
  assert.equal(await triedAt(there, byAddress), 'T0005')
  // An address of the newer kind is counted by its first 64 bits: one line at home holds a whole range of them.
  const [one, other, far] = ['2001:db8:1:2::10', '2001:db8:1:2:ffff::99', '2001:db8:1:3::10'].map((from) =>
    app.browser({ from }),
  )
  const newer = { email: 'six@example.com', tries: 1, per: '1 hour', address: true }
  assert.deepEqual(
    [await triedAt(one, newer), await triedAt(other, newer), await triedAt(far, newer)],
    ['ok', 'T0005', 'ok'],
  )

  // Inside a change a count would be undone with the write: it is refused there.
  const system = app.as('system')
  await assert.rejects(system.call('guessInWrite', { email: 'maya@example.com' }), { code: 'T0013' })
  // Where no request is being answered, `address: true` counts by the key alone.
  const alone = { email: 'solo@example.com', tries: 1, per: '1 hour', address: true }
  await system.call('guess', alone)
  await assert.rejects(system.call('guess', alone), { code: 'T0005' })
})

test('[17-5] attempts.limit with address: true counts for the address of that browser', async (t) => {
  const app = await opened(t)
  const [here, there] = [app.browser({ from: '203.0.113.5' }), app.browser({ from: '203.0.113.6' })]
  const input = { email: 'maya@example.com', address: true }
  for (let k = 0; k < 3; k++) assert.deepEqual(await here.call('guess', input), { ok: true })
  const over = await here.call('guess', input)
  assert.deepEqual([over.ok, over.error?.code], [false, 'T0005'])
  // The same account from another address has a count of its own.
  assert.deepEqual(await there.call('guess', input), { ok: true })
})
