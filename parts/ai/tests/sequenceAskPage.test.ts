import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'
import { handing, lateOrders } from './sequencing.ts'

/** The error of a tool's answer over MCP, as the part of it that is kept from the model holds it. */
const errorOf = (result: Record<string, unknown>): Record<string, unknown> => Object(Object(result._meta)['tent.error'])

test('[25-5] the page of the ask of a sequence, of an agent offered to MCP, lists every call that the ask lists with the title of its tool and its input, and says where more may follow', async (t) => {
  const folder = copyOf(t, 'sequenced')
  const file = join(folder, 'functions.ts')
  const text = readFileSync(file, 'utf8')
  const from = "export const asking = agent('asking', {\n  model: writer,"
  assert.ok(text.includes(from))
  writeFileSync(
    file,
    text.replace(
      from,
      "export const asking = agent('asking', {\n  about: 'Refunds and asks',\n  offer: ['mcp'],\n  model: writer,",
    ),
  )
  const app = await testApp({ folder })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  const orders: string[] = []
  for (const total of [50, 150, 250, 350])
    orders.push(String(Reflect.get(Object(await app.as(maya).call('addOrder', { item: 'tent', total })), 'id')))
  app.fake('writer', handing(lateOrders))
  // A client that cannot ask is told the run and the page of its ask.
  const waits = await app.mcp({ as: maya }).call('asking', { message: 'Refund.' })
  assert.equal(errorOf(waits).code, 'T0008', JSON.stringify(waits))
  const page = String(Object(errorOf(waits).fields).page)
  assert.match(page, /^http:\/\/localhost\/_t\/ask\?a=/)
  const shown = await app.browser({ as: maya }).request('GET', page.slice('http://localhost'.length))
  assert.equal(shown.status, 200)
  const html = await shown.text()
  // Each of the three refunds that the ask lists, by the title of its tool and its order, and the line of more.
  for (const order of orders.slice(1)) assert.match(html, new RegExp(`<li>Refund: order: ${order}</li>`), html)
  assert.match(html, /More may be asked after these\./)
})
