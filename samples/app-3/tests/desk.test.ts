import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import test from 'node:test'
import { testApp } from 'tentjs/test'
import { type App, fakeAll, GUIDE, HOOK_SECRET, mailCall, settle, userOf } from '../fakes/fakes'

async function open() {
  const app = await testApp({ secrets: { MAIL_HOOK: HOOK_SECRET } })
  const fakes = fakeAll(app)
  return { app, fakes, sam: await userOf(app, 'sam@desk.example'), ada: await userOf(app, 'ada@desk.example') }
}

async function addGuide(app: App, sam: string): Promise<void> {
  const browser = app.browser({ as: sam })
  const uploaded = await browser.upload(GUIDE, { name: 'guide.pdf', kind: 'application/pdf' })
  await browser.call('addGuide', { title: 'Help desk guide', file: String(Object(Object(uploaded).value).id) })
  await app.settled()
}

test('a mail from a known customer joins their customer row, whatever the case of the address', async () => {
  const { app } = await open()
  const before = (await app.rows('customers')).length
  await app.incoming(
    'mailReceived',
    mailCall({ from: ' ADA@desk.example ', subject: 'Where is my parcel?', text: 'It is late.' }, 'msg_known'),
  )
  await app.settled()
  assert.equal((await app.rows('customers')).length, before)
  const ticket = (await app.rows('tickets')).find((row) => row.subject === 'Where is my parcel?')
  const ada = (await app.rows('customers')).find((row) => row.email === 'ada@desk.example')
  assert.equal(ticket?.customer, ada?.id)
  assert.equal(ticket?.status, 'open')
  const first = (await app.rows('messages')).filter((row) => row.ticket === ticket?.id)
  assert.deepEqual(
    first.map((row) => [row.who, row.text]),
    [['user', 'It is late.']],
  )
  await app.close()
})

test('a call of the hook that holds no mail opens no ticket', async () => {
  const { app } = await open()
  const before = (await app.rows('tickets')).length
  const answer = await app.incoming('mailReceived', { body: JSON.stringify({ hello: 'there' }) })
  assert.equal(answer.status, 200)
  await app.settled()
  assert.equal((await app.rows('tickets')).length, before)
  await app.close()
})

test('a customer reads their own tickets and no other, and no list of the staff', async () => {
  const { app, ada } = await open()
  await assert.rejects(app.as(ada).call('ticketList', {}), { code: 'T3101' })
  const mine = await app.as(ada).call('myTickets', {})
  const subjects = mine.map((row) => row.subject).sort()
  assert.deepEqual(subjects, ['My parcel is late', 'The wrong size came'])
  await app.close()
})

test('an answer joins the conversation, marks the ticket answered, and is mailed to the customer', async () => {
  const { app, fakes, sam } = await open()
  const ticket = (await app.rows('tickets')).find((row) => row.subject === 'Can I order by phone?')
  assert.ok(ticket)
  await app.as(sam).call('answerTicket', { ticket: ticket.id, text: 'Yes: call 0800 123 456.' })
  await app.settled()
  assert.equal((await app.rows('tickets')).find((row) => row.id === ticket.id)?.status, 'answered')
  const said = (await app.rows('messages')).filter((row) => row.ticket === ticket.id).map((row) => row.text)
  assert.ok(said.includes('Yes: call 0800 123 456.'))
  assert.deepEqual(
    fakes.mail.sent.map((one) => one.input),
    [{ to: 'alan@desk.example', subject: 'Re: Can I order by phone?', text: 'Yes: call 0800 123 456.' }],
  )
  await app.as(sam).call('closeTicket', { ticket: ticket.id })
  assert.equal((await app.rows('tickets')).find((row) => row.id === ticket.id)?.status, 'closed')
  await app.close()
})

test('a guide is cut into a chunk for each of its pages, and found by meaning', async () => {
  const { app, sam, ada } = await open()
  await addGuide(app, sam)
  const chunks = await app.rows('guideChunks')
  assert.deepEqual(chunks.map((chunk) => chunk.page).sort(), [1, 2, 3])
  const found = await app.as(ada).call('findInGuide', { question: 'Can my order be refunded?' })
  // A flow called by its name answers `unknown`, so the first chunk is read field by field.
  const first = Object(Array.isArray(found) ? found[0] : undefined)
  assert.equal(Reflect.get(first, 'page'), 3)
  assert.equal(Reflect.get(first, 'title'), 'Help desk guide')
  await app.close()
})

test('staff alone upload a guide', async () => {
  const { app, ada } = await open()
  const browser = app.browser({ as: ada })
  const uploaded = await browser.upload(GUIDE, { name: 'guide.pdf', kind: 'application/pdf' })
  const added = await browser.call('addGuide', { title: 'Mine', file: String(Object(Object(uploaded).value).id) })
  assert.equal(Object(added).ok, false)
  assert.equal(Object(Object(added).error).code, 'T3101')
  await app.close()
})

test('a program with a key may not refund an order with nobody to say yes', async () => {
  const { app, fakes } = await open()
  const { key } = await app.key({ scopes: ['refundOrder'], roles: ['staff'] })
  const answer = await app.request(
    new Request('http://localhost/_t/call/refundOrder', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ input: { order: 'ord_1077' } }),
    }),
  )
  assert.equal(answer.status, 403)
  assert.match(await answer.text(), /T7120/)
  assert.equal(fakes.payments.sent.length, 0)
  await app.close()
})

test('a person signs in with the code that was mailed to them', async () => {
  const { app, sam } = await open()
  const browser = app.browser()
  assert.deepEqual(await browser.call('sendCode', { email: 'Sam@desk.example' }), {
    ok: true,
    value: { email: 'sam@desk.example' },
  })
  const mailed = app.mailbox.at(-1)
  const code = /\d{6}/.exec(String(Object(mailed).text))?.[0]
  assert.ok(code, 'the mail holds a code of six digits')
  const wrong = await browser.call('signInWithCode', { email: 'sam@desk.example', code: '000000' })
  assert.equal(Object(Object(wrong).error).code, 'wrong-code')
  const right = await browser.call('signInWithCode', { email: 'sam@desk.example', code })
  assert.equal(Object(right).ok, true)
  assert.equal((await browser.page('/tickets')).status, 200)
  assert.equal((await app.browser().page('/tickets')).status, 302)
  assert.ok(sam)
  await app.close()
})

test('every screen draws in light and in dark, on a wide screen and on a phone', async () => {
  const { app, sam, ada } = await open()
  const pictures = new URL('../walk/pictures/looks/', import.meta.url)
  await mkdir(pictures, { recursive: true })
  await addGuide(app, sam)
  const ticket = (await app.rows('tickets')).find((row) => row.subject === 'The wrong size came')
  assert.ok(ticket)
  const screens = [
    ['tickets', '/tickets', sam],
    ['ticket', `/tickets/${ticket.id}`, sam],
    ['guides', '/guides', sam],
    ['ask', '/ask', ada],
    ['sign-in', '/sign-in', undefined],
    ['sign-in-code', '/sign-in?mailedTo=sam%40desk.example', undefined],
  ] as const
  const phone: [number, number] = [390, 844]
  const looks: [string, { size?: [number, number]; dark?: boolean }][] = [
    ['wide-light', {}],
    ['wide-dark', { dark: true }],
    ['phone-light', { size: phone }],
    ['phone-dark', { size: phone, dark: true }],
  ]
  for (const [name, path, as] of screens) {
    for (const [look, options] of looks) {
      const page = await app.open(path, { ...(as ? { as } : {}), ...options })
      assert.ok((await page.reader()).includes('heading'), `${path} draws a heading`)
      await settle()
      await writeFile(new URL(`${name}-${look}.png`, pictures), await page.picture({ full: true }))
    }
  }
  await app.close()
})
