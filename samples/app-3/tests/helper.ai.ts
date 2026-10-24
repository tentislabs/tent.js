import assert from 'node:assert/strict'
import test from 'node:test'
import { evals, testApp } from 'tentjs/test'
import { fakeAll, GUIDE, HOOK_SECRET, mailCall, userOf } from '../fakes/fakes'

// What the helper does with its tools, with every model faked: these hold the wiring, and a real model runs
// them too once its faked writer is taken away.
test('the helper answers from the guide with its page, finds past tickets, and asks before a refund', async () => {
  const app = await testApp({ secrets: { MAIL_HOOK: HOOK_SECRET } })
  const fakes = fakeAll(app)
  const sam = await userOf(app, 'sam@desk.example')
  const browser = app.browser({ as: sam })
  const uploaded = await browser.upload(GUIDE, { name: 'guide.pdf', kind: 'application/pdf' })
  await browser.call('addGuide', { title: 'Help desk guide', file: String(Object(Object(uploaded).value).id) })
  await app.incoming(
    'mailReceived',
    mailCall({ from: 'ada@desk.example', subject: 'A lamp came broken', text: 'The lamp came broken.' }, 'ai_1'),
  )
  await app.settled()
  const [ticket] = (await app.rows('tickets')).filter((row) => row.subject === 'A lamp came broken')
  assert.ok(ticket)
  const result = await evals(
    app,
    'helper',
    [
      {
        name: 'a question of how is answered from the guide, with its page',
        say: 'How do I reset a password?',
        expect: { text: /\(Help desk guide, page 2\)$/, called: 'findInGuide' },
      },
      {
        name: 'a refund is asked about first, and not made',
        say: 'Refund the order ord_2001',
        expect: { asked: 'refundOrder' },
      },
    ],
    { as: sam, runs: 1 },
  )
  assert.equal(result.failed, 0, JSON.stringify(result))
  assert.equal(fakes.payments.sent.filter((one) => one.call === 'refundOrder').length, 0)
  const near = await evals(
    app,
    'findInTickets',
    [{ input: { question: 'my lamp is broken' }, expect: (got) => JSON.stringify(got.value).includes(ticket.id) }],
    { as: sam, runs: 1 },
  )
  assert.equal(near.failed, 0, JSON.stringify(near))
  await app.close()
})
