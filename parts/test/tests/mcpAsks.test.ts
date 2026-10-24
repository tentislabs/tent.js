import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { TestApp } from '../index.ts'
import { errorOf, callerIdOf, mcpApp, mcpProject, opened, people } from './mcpApp.ts'

/** An order of a person, made through MCP: its id. */
async function orderOf(app: TestApp, person: Caller, title = 'to remove'): Promise<string> {
  const added = await app.mcp({ as: person }).call('addOrder', { title })
  return String(Object(added.structuredContent).id)
}

/** How many orders the app holds. */
const counted = async (app: TestApp): Promise<number> => (await app.rows('orders')).length

test('[25-5] a client that can ask is answered "more is needed", and a yes runs the function once, also when it arrives twice', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  const order = await orderOf(app, ada)
  const client = app.mcp({ as: ada, asks: true })
  const asked = await client.call('removeOrder', { order, note: 'a secret note' })
  assert.equal(asked.resultType, 'input_required', JSON.stringify(asked))
  const question = Object(Object(asked.inputRequests).ask)
  assert.equal(question.method, 'elicitation/create')
  const message = String(Object(question.params).message)
  assert.match(message, /^Run Remove order\?/)
  assert.match(message, new RegExp(order))
  assert.doesNotMatch(message, /a secret note/, 'a field marked secret is shown as [secret]')
  assert.equal(typeof asked.requestState, 'string')
  const yes = { inputResponses: { ask: { action: 'accept', content: {} } }, requestState: asked.requestState }
  assert.equal(await counted(app), 1)
  const ran = await client.call('removeOrder', { order, note: 'a secret note' }, yes)
  assert.equal(ran.isError, undefined, JSON.stringify(ran))
  assert.equal(await counted(app), 0)
  // The yes arrives twice: the function ran once, and the second is answered what the first was.
  const again = await client.call('removeOrder', { order, note: 'a secret note' }, yes)
  assert.deepEqual(again, ran)
})

test('[25-5] [05-13.4] the same yes with another input, a yes after eleven minutes, and a no are T7120', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  const client = app.mcp({ as: ada, asks: true })
  const [first, second] = [await orderOf(app, ada, 'first'), await orderOf(app, ada, 'second')]
  const asked = await client.call('removeOrder', { order: first })
  const yes = { inputResponses: { ask: { action: 'accept', content: {} } }, requestState: asked.requestState }
  assert.equal(errorOf(await client.call('removeOrder', { order: second }, yes)).code, 'T7120')
  const no = { inputResponses: { ask: { action: 'decline' } }, requestState: asked.requestState }
  assert.equal(errorOf(await client.call('removeOrder', { order: first }, no)).code, 'T7120')
  const late = await client.call('removeOrder', { order: first })
  app.clock.advance('11 minutes')
  const lateYes = { inputResponses: { ask: { action: 'accept', content: {} } }, requestState: late.requestState }
  assert.equal(errorOf(await client.call('removeOrder', { order: first }, lateYes)).code, 'T7120')
  assert.equal(await counted(app), 2, 'nothing was removed')
})

test("[25-5] [05-13.4] a client of the older form and one that cannot ask are T7120, and with `asks: 'client'` or the client's host in the list the function runs", async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  const order = await orderOf(app, ada)
  for (const client of [app.mcp({ as: ada, form: '2025-06-18', asks: true }), app.mcp({ as: ada })]) {
    const refused = await client.call('removeOrder', { order })
    assert.equal(errorOf(refused).code, 'T7120')
  }
  const trusting = await mcpApp(t, [{ from: 'mcp: { names', to: "mcp: { asks: 'client', names" }])
  const { ada: trusted } = await people(trusting)
  const one = await orderOf(trusting, trusted)
  assert.equal((await trusting.mcp({ as: trusted }).call('removeOrder', { order: one })).isError, undefined)
  const listed = await mcpApp(t, [{ from: 'mcp: { names', to: "mcp: { asks: ['chat.example'], names" }])
  const { ada: person } = await people(listed)
  const two = await orderOf(listed, person)
  const { token } = await listed.grant({
    user: callerIdOf(person),
    scopes: ['write'],
    client: 'https://chat.example/client.json',
  })
  assert.equal((await listed.mcp({ as: { token } }).call('removeOrder', { order: two })).isError, undefined)
  const other = await listed.grant({
    user: callerIdOf(person),
    scopes: ['write'],
    client: 'https://other.example/c.json',
  })
  const three = await orderOf(listed, person)
  assert.equal(
    errorOf(await listed.mcp({ as: { token: other.token } }).call('removeOrder', { order: three })).code,
    'T7120',
  )
})

test("[25-5] [05-13.38] a client of the older form is answered T7120 with the address of the page, the signed-in person's yes there lets the next call run once, and another person's yes does nothing", async (t) => {
  const app = await mcpApp(t)
  const { ada, bob } = await people(app)
  const order = await orderOf(app, ada)
  const client = app.mcp({ as: ada, form: '2025-06-18' })
  const refused = await client.call('removeOrder', { order, note: 'a secret note' })
  const page = String(Object(errorOf(refused).fields).page)
  assert.match(page, /^http:\/\/localhost\/_t\/ask\?a=/)
  const path = page.slice('http://localhost'.length)
  const asBob = app.browser({ as: bob })
  assert.equal((await asBob.request('GET', path)).status, 404, 'another person is not shown it')
  const asAda = app.browser({ as: ada })
  const shown = await asAda.request('GET', path)
  assert.equal(shown.status, 200)
  const html = await shown.text()
  assert.match(html, /Run Remove order\?/)
  assert.match(html, new RegExp(order))
  assert.match(html, /\[secret\]/)
  assert.doesNotMatch(html, /a secret note/)
  assert.doesNotMatch(html, /<script/i)
  assert.match(String(shown.headers.get('content-security-policy')), /frame-ancestors 'none'/)
  const text = /name="t" value="([^"]+)"/.exec(html)?.[1] ?? ''
  const answer = (browser: typeof asAda, said: string) =>
    browser.request('POST', '/_t/ask', {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ t: text, answer: said }).toString(),
    })
  assert.equal(errorOf(await client.call('removeOrder', { order, note: 'a secret note' })).code, 'T7120')
  await answer(asBob, 'allow')
  assert.equal(errorOf(await client.call('removeOrder', { order, note: 'a secret note' })).code, 'T7120')
  assert.equal((await asAda.request('GET', '/_t/ask', {})).status, 404)
  assert.equal((await answer(asAda, 'allow')).status, 200)
  const ran = await client.call('removeOrder', { order, note: 'a secret note' })
  assert.equal(ran.isError, undefined, JSON.stringify(ran))
  assert.equal(await counted(app), 0)
  const another = await orderOf(app, ada)
  assert.equal(errorOf(await client.call('removeOrder', { order: another })).code, 'T7120', 'the yes ran one call')
  assert.equal((await answer(asAda, 'allow')).status, 400, 'the text of the page works once')
})

/** The edits that give the project of the MCP door a flow offered to MCP whose run asks the person before it goes on. */
const askedJob = [
  {
    file: 'functions.ts',
    from: 'import { action, anyone, change, flow,',
    to: 'import { action, anyone, boolean, change, flow,',
  },
  {
    file: 'functions.ts',
    from: "export const pagesOnly = flow('pagesOnly', {",
    to: `export const askedJob = flow('askedJob', {
  about: 'Asks the person before it goes on, in a run',
  access: 'signedIn',
  offer: ['mcp'],
  as: 'starter',
  input: { word: text() },
  output: object({ word: text(), approved: boolean() }),
  run: async ({ input, step }) => {
    const said = await step.waitFor('approve', { timeout: '1 hour', show: { word: input.word } })
    return step('after', () => ({ word: input.word, approved: said.approved === true }))
  },
})

export const pagesOnly = flow('pagesOnly', {`,
  },
]

test('[25-3] [25-5] the ask of a run of an offered flow is the question of a client that can ask, its answer agrees or refuses and the call waits again; for one that cannot, T0008 carries the page of the ask', async (t) => {
  const app = await mcpApp(t, askedJob)
  const { ada, bob } = await people(app)
  const client = app.mcp({ as: ada, asks: true })
  const asked = await client.call('askedJob', { word: 'yes' })
  assert.equal(asked.resultType, 'input_required', JSON.stringify(asked))
  assert.equal(Object(Object(asked.inputRequests).ask).method, 'elicitation/create')
  const yes = { inputResponses: { ask: { action: 'accept', content: {} } }, requestState: asked.requestState }
  const done = await client.call('askedJob', { word: 'yes' }, yes)
  assert.deepEqual(done.structuredContent, { word: 'yes', approved: true }, JSON.stringify(done))
  const again = await client.call('askedJob', { word: 'no' })
  const no = { inputResponses: { ask: { action: 'decline' } }, requestState: again.requestState }
  const refused = await client.call('askedJob', { word: 'no' }, no)
  assert.deepEqual(refused.structuredContent, { word: 'no', approved: false }, JSON.stringify(refused))
  // Another person's client cannot answer the ask of Ada's run with the text it was handed.
  const other = await client.call('askedJob', { word: 'other' })
  const stolen = { inputResponses: { ask: { action: 'accept', content: {} } }, requestState: other.requestState }
  assert.equal((await app.mcp({ as: bob, asks: true }).call('askedJob', { word: 'other' }, stolen)).isError, true)
  // A client that cannot ask is told the run and the page where the person says yes or no.
  const plain = app.mcp({ as: ada })
  const waits = await plain.call('askedJob', { word: 'page' })
  assert.equal(errorOf(waits).code, 'T0008', JSON.stringify(waits))
  const fields = Object(errorOf(waits).fields)
  const page = String(fields.page)
  assert.match(page, /^http:\/\/localhost\/_t\/ask\?a=/)
  const browser = app.browser({ as: ada })
  const shown = await browser.request('GET', page.slice('http://localhost'.length))
  assert.equal(shown.status, 200)
  const text = /name="t" value="([^"]+)"/.exec(await shown.text())?.[1] ?? ''
  const said = await browser.request('POST', '/_t/ask', {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ t: text, answer: 'allow' }).toString(),
  })
  assert.equal(said.status, 200)
  const waited = await plain.call('askedJob', { run: String(fields.run) })
  assert.deepEqual(waited.structuredContent, { word: 'page', approved: true }, JSON.stringify(waited))
})

test("[25-5] the project's own screen `for: 'ask'` is drawn in place of the engine's page, with `ask`", async (t) => {
  const folder = mcpProject(t)
  writeFileSync(
    join(folder, 'ask.tsx'),
    `import { screen, Form } from 'tentjs/ui'

export const askPerson = screen('askPerson', {
  for: 'ask',
  access: 'signedIn',
  view: ({ ask }) => (
    <div>
      <h1>May {ask.tool} run?</h1>
      <Form call={ask.allow}><button type="submit"><span>Yes, run it</span></button></Form>
      <Form call={ask.refuse}><button type="submit"><span>No</span></button></Form>
    </div>
  ),
})
`,
  )
  const app = await opened(t, folder)
  const { ada } = await people(app)
  const order = await orderOf(app, ada)
  const refused = await app.mcp({ as: ada, form: '2025-06-18' }).call('removeOrder', { order })
  const path = String(Object(errorOf(refused).fields).page).slice('http://localhost'.length)
  const shown = await app.browser({ as: ada }).request('GET', path)
  assert.equal(shown.status, 200)
  const html = await shown.text()
  assert.match(html, /"screen":"askPerson"/)
  assert.match(html, /"ask":\{"title":"Remove order"/)
  assert.match(String(shown.headers.get('content-security-policy')), /frame-ancestors 'none'/)
})

test('[25-5] with `mcp: { stream: true }` a client of the older form is asked over its kept stream, and its yes runs the function', async (t) => {
  const app = await mcpApp(t, [{ from: 'mcp: { names', to: 'mcp: { stream: true, names' }])
  const { ada } = await people(app)
  const order = await orderOf(app, ada)
  const client = app.mcp({ as: ada, form: '2025-06-18', asks: true })
  const stream = await client.listen()
  const calling = client.call('removeOrder', { order })
  const question = await stream.next()
  assert.equal(question.method, 'elicitation/create')
  assert.match(String(Object(question.params).message), /^Run Remove order\?/)
  await client.send({ jsonrpc: '2.0', id: question.id, result: { action: 'accept', content: {} } })
  const ran = await calling
  assert.equal(ran.isError, undefined, JSON.stringify(ran))
  assert.equal(await counted(app), 0)
  stream.close()
})
