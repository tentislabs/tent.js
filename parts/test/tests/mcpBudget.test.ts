import assert from 'node:assert/strict'
import test from 'node:test'
import { errorOf, mcpApp, people } from './mcpApp.ts'

// Every function of the project of toolsListed but the last, which a key of the tests leaves out of its scopes.
const allButLast = [
  'revenueByMonth',
  'ordersToday',
  'ordersThisWeek',
  'bestCustomers',
  'lateDeliveries',
  'openTickets',
  'stockLevels',
  'cheapProducts',
  'newCustomers',
  'refundsThisMonth',
  'topProducts',
  'slowProducts',
  'taxOfYear',
  'shippingCosts',
  'cartsLeft',
  'reviewsNew',
  'returnsOpen',
  'couponsUsed',
  'visitsToday',
  'suppliersLate',
  'staffRevenue',
]

/** What `findFunction` answered: the names of the functions, and whether more are there. */
function found(result: Record<string, unknown>): { names: string[]; more: unknown } {
  const value = Object(result.structuredContent)
  return {
    names: (Array.isArray(value.functions) ? value.functions : []).map((one: unknown) => Object(one).name),
    more: value.more,
  }
}

test('[25-4] above toolsListed the list is the pair: findFunction finds by the words of an `about` in any capitals, and callFunction calls under the rule of the function', async (t) => {
  const app = await mcpApp(t, [], 'mcpBudget')
  const { ada } = await people(app)
  const client = app.mcp({ as: ada })
  const tools = await client.tools()
  assert.deepEqual(
    tools.map((one) => one.name),
    ['findFunction', 'callFunction'],
  )
  const call = Object(tools.find((one) => one.name === 'callFunction')?.annotations)
  assert.deepEqual([call.readOnlyHint, call.destructiveHint], [false, true])
  assert.deepEqual(found(await client.call('findFunction', { words: 'monthly REVENUE' })).names, ['revenueByMonth'])
  assert.deepEqual(found(await client.call('findFunction', { words: 'revenue' })).names, [
    'revenueByMonth',
    'staffRevenue',
  ])
  const firstPage = found(await client.call('findFunction', { words: 'the', limit: 5 }))
  assert.equal(firstPage.names.length, 5)
  assert.equal(firstPage.more, true)
  const next = found(await client.call('findFunction', { words: 'the', limit: 5, after: firstPage.names[4] }))
  assert.ok(
    next.names.every((name) => name > String(firstPage.names[4])),
    next.names.join(' '),
  )
  const answered = await client.call('callFunction', { name: 'revenueByMonth', input: {} })
  assert.deepEqual(answered.structuredContent, { value: 'revenueByMonth' })
  const refused = await client.call('callFunction', { name: 'staffRevenue', input: {} })
  assert.equal(errorOf(refused).code, 'T3101')
  // A function that is not listed is still found by its name.
  assert.deepEqual((await client.call('ordersToday', {})).structuredContent, { value: 'ordersToday' })
})

test('[25-4] [05-13.24] findFunction answers none that the caller would not be listed, and with `toolsListed: 30` the functions are listed', async (t) => {
  const app = await mcpApp(t, [], 'mcpBudget')
  const { key } = await app.key({ scopes: allButLast })
  const client = app.mcp({ as: { token: key } })
  assert.deepEqual(
    (await client.tools()).map((one) => one.name),
    ['findFunction', 'callFunction'],
  )
  assert.deepEqual(found(await client.call('findFunction', { words: 'twenty-second' })).names, [])
  assert.deepEqual(found(await client.call('findFunction', { words: 'revenue' })).names, [
    'revenueByMonth',
    'staffRevenue',
  ])
  const outside = await client.call('callFunction', { name: 'lastOne', input: {} })
  assert.equal(errorOf(outside).code, 'T3101')
  const wide = await mcpApp(t, [{ from: 'mcp: { names: {} }', to: 'mcp: { toolsListed: 30, names: {} }' }], 'mcpBudget')
  const { key: wideKey } = await wide.key({ scopes: allButLast })
  const listed = (await wide.mcp({ as: { token: wideKey } }).tools()).map((one) => String(one.name))
  assert.deepEqual(listed.sort(), [...allButLast].sort())
})
