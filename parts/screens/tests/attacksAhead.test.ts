import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Reach } from '../page/alive.ts'
import { livingPage } from '../page/browser.ts'
import { pageOf, rows } from './drawn.ts'

// The plans of a page whose change adds a row to `secrets`: a list of them that the caller may not read is refused
// to them, and one the page never asked is not held at all.
const plans = {
  changes: {
    addSecret: { writes: [{ add: 'secrets', values: { title: { input: 'title' }, box: 'inbox' } }], defaults: {} },
  },
  queries: {
    staffSecrets: { plan: { from: 'secrets', where: { col: 'box', is: 'inbox' } } },
    otherSecrets: { plan: { from: 'secrets' } },
  },
}

const refused = { code: 'T3101', name: 'not-allowed', message: 'Only staff may read this.' }

test('[44-10.11] a change shown ahead into a list the caller may not read, or that the page does not hold, shows nothing and reads nothing', async () => {
  const sent: string[] = []
  let answer: (value: unknown) => void = () => undefined
  const reach: Reach = {
    post: (path) => {
      sent.push(path)
      // The engine's answer of the change is held back until the test lets it go.
      return path.startsWith('/_t/call/')
        ? new Promise((done) => {
            answer = done
          })
        : Promise.resolve({ ok: true, value: [] })
    },
    go: () => undefined,
    wait: () => () => undefined,
  }
  const page = livingPage(
    pageOf('s', {
      path: '/s',
      plans,
      answers: [
        { what: 'openOrders', input: { limit: 2 }, entry: 'orders', value: rows, mark: 'm' },
        { what: 'staffSecrets', input: {}, entry: 'secrets', error: refused },
      ],
    }),
    [{ name: 's', kind: 'screen' }],
    reach,
  )
  const before = page.ask('staffSecrets', {}, { entry: 'secrets' })
  const calling = page.call('addSecret', { title: 'the plan of the vault' })
  // While the call is under way, the refused list stays refused, and the list of another table is as it was.
  const during = page.ask('staffSecrets', {}, { entry: 'secrets' })
  assert.deepEqual([during?.value, during?.error], [before?.value, refused])
  assert.equal(JSON.stringify(during).includes('the plan of the vault'), false)
  assert.deepEqual(page.ask('openOrders', { limit: 2 }, { entry: 'orders' })?.value, rows)
  // Nothing was read for the optimistic result: the page sent the call alone, and holds no answer of the list it never asked.
  assert.deepEqual(sent, ['/_t/call/addSecret'])
  assert.equal(
    page.answers.has(JSON.stringify(['otherSecrets', {}])) ||
      [...page.answers.keys()].some((key) => key.includes('otherSecrets')),
    false,
  )
  answer({ ok: true, value: { id: 'real' } })
  await calling
})
