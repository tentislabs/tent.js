import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

test('[48-10] one test opens a page, calls the API with a key, an MCP tool with a grant and the command line, each waiting by fact, and the row of each is on the page at its next step', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'everyone') })
  closing(t, () => app.close())
  const ada = await app.user({ name: 'Ada', roles: [] })
  const id = String(ada.user?.id)
  const page = await app.open('/orders', { as: ada })
  assert.equal((await page.text('0 orders')).text, '0 orders')
  // The API, with a key of the user.
  const { caller } = await app.key({ user: id })
  await app.as(caller).call('addOrder', { title: 'By the API' })
  // An MCP tool, with a grant that the user gave a program.
  const given = await app.grant({ user: id, scopes: ['write'], client: 'https://chat.example/client.json' })
  const answered = await app.mcp({ as: { token: given.token } }).call('addOrder', { title: 'By MCP' })
  assert.notEqual(answered.isError, true, JSON.stringify(answered))
  // The app's own command line, as the user.
  const ran = await app.cli(['add-order', '--title', 'By the line'], { as: id })
  assert.equal(ran.code, 0, ran.out + ran.err)
  // Each answered once the open page held what it wrote: the rows are on the page at the next step.
  const rows = await app.rows('orders')
  for (const title of ['By the API', 'By MCP', 'By the line']) {
    const row = rows.find((one) => one.title === title)
    assert.ok(row, title)
    assert.equal((await page.block(`order-${row.id}`)).text, title)
  }
  assert.equal((await page.text('3 orders')).text, '3 orders')
})

test('[48-10] page.say tests the chat screen of an agent to the end of its turn, its steps readable from the page', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'everyone') })
  closing(t, () => app.close())
  const ada = await app.user({ name: 'Ada', roles: [] })
  app.fake('writer', [{ text: 'Order 1042 has shipped.' }])
  const chat = String(Reflect.get(Object(await app.as(ada).call('newChat', {})), 'id'))
  const page = await app.open(`/chats/${chat}`, { as: ada })
  const said = await page.say('Where is my order?')
  // The turn has ended: the run is done, with its answer and its steps.
  assert.equal(said.state, 'done')
  assert.equal(said.text, 'Order 1042 has shipped.')
  assert.ok(said.steps.length > 0, JSON.stringify(said))
  assert.deepEqual(said.asks, [])
  // The page shows the question and the answer at once.
  assert.equal((await page.text('Where is my order?')).text, 'Where is my order?')
  assert.equal((await page.text('Order 1042 has shipped.')).text, 'Order 1042 has shipped.')
})
