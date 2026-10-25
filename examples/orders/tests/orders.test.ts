import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from 'tentjs/test'

type App = Awaited<ReturnType<typeof testApp>>

// The id of a user that the seed made, found by its email.
async function userId(app: App, email: string): Promise<string> {
  const users = await app.rows('users')
  const user = users.find((row) => row.email === email)
  assert.ok(user, `the seed holds a user with the email ${email}`)
  return String(user.id)
}

// The rows of the list of a screen, as its first HTML holds them.
function listed(html: string): string[] {
  const body = html.split('<tbody')[1]?.split('</tbody>')[0] ?? ''
  return body.split(/<tr[ >]/).slice(1)
}

async function customerId(app: App, name: string): Promise<string> {
  const customers = await app.rows('customers')
  const customer = customers.find((row) => row.name === name)
  assert.ok(customer, `the seed holds the customer ${name}`)
  return String(customer.id)
}

test('the seed holds four users, three customers and forty orders, eight open and twenty-five paid', async () => {
  const app = await testApp()
  try {
    const users = await app.rows('users')
    const customers = await app.rows('customers')
    const orders = await app.rows('orders')
    assert.equal(users.length, 4)
    assert.equal(users.filter((user) => Array.isArray(user.roles) && user.roles.includes('staff')).length, 2)
    assert.equal(customers.length, 3)
    assert.equal(customers.filter((customer) => customer.user !== undefined && customer.user !== null).length, 2)
    assert.equal(orders.length, 40)
    assert.equal(orders.filter((order) => order.status === 'open').length, 8)
    assert.equal(orders.filter((order) => order.status === 'paid').length, 25)
  } finally {
    await app.close()
  }
})

test('step 1 of the walk: staff are answered the eight open orders, newest first, the first Ada Lovelace with 1999', async () => {
  const app = await testApp()
  try {
    const sam = await userId(app, 'sam@shop.example')
    const open = await app.as(sam).call('ordersByStatus', { status: 'open' })
    assert.equal(open.length, 8)
    assert.equal(open[0]?.customer.name, 'Ada Lovelace')
    assert.equal(open[0]?.total, 1999)
    for (const order of open) assert.equal(typeof order.customer.name, 'string')
  } finally {
    await app.close()
  }
})

test('step 1 of the walk: the first HTML of /orders holds eight orders, the first with "Ada Lovelace" and "$19.99"', async () => {
  const app = await testApp()
  try {
    const sam = await userId(app, 'sam@shop.example')
    const page = await app.as(sam).page('/orders')
    assert.equal(page.status, 200)
    const rows = listed(page.html)
    assert.equal(rows.length, 8)
    assert.match(rows[0] ?? '', />Ada Lovelace</)
    assert.match(rows[0] ?? '', />\$19\.99</)
    for (const row of rows) assert.match(row, />\$\d+\.\d\d</)
    assert.match(page.html, /href="\/orders\/new"[^>]*>(<svg[\s\S]*?<\/svg>)?New order</)
  } finally {
    await app.close()
  }
})

test('the staff screens are for staff: a visitor is sent to the sign-in, and a customer is answered "not found"', async () => {
  const app = await testApp()
  try {
    const ada = await userId(app, 'ada@example.com')
    for (const path of ['/orders', '/orders/new', '/customers', '/customers/new']) {
      const visitor = await app.as('nobody').page(path)
      assert.equal(visitor.status, 302, path)
      assert.match(String(visitor.headers.location), /^\/sign-in\?back=/)
      assert.equal((await app.as(ada).page(path)).status, 404, path)
    }
    await assert.rejects(app.as(ada).call('ordersByStatus', { status: 'open' }), { code: 'T3101' })
  } finally {
    await app.close()
  }
})

test('step 2 of the walk: a new order stands first among the open orders, and its customer is in the form', async () => {
  const app = await testApp()
  try {
    const sam = await userId(app, 'sam@shop.example')
    const grace = await customerId(app, 'Grace Hopper')
    const form = await app.as(sam).page('/orders/new')
    assert.equal(form.status, 200)
    for (const name of ['Ada Lovelace', 'Alan Turing', 'Grace Hopper'])
      assert.match(form.html, new RegExp(`<option[^>]*>${name}<`))
    const added = await app.as(sam).call('addOrder', { customer: grace, total: 4250 })
    const open = await app.as(sam).call('ordersByStatus', { status: 'open' })
    assert.equal(open.length, 9)
    assert.equal(open[0]?.id, added.id)
    assert.equal(open[0]?.customer.name, 'Grace Hopper')
    assert.equal(open[0]?.status, 'open')
    const page = await app.as(sam).page('/orders')
    const first = listed(page.html)[0] ?? ''
    assert.match(first, />Grace Hopper</)
    assert.match(first, />\$42\.50</)
  } finally {
    await app.close()
  }
})

test('a new order belongs to the user of its customer, and to the staff member where the customer has none', async () => {
  const app = await testApp()
  try {
    const sam = await userId(app, 'sam@shop.example')
    const graceUser = await userId(app, 'grace@example.com')
    const forGrace = await app.as(sam).call('addOrder', { customer: await customerId(app, 'Grace Hopper'), total: 100 })
    const forAlan = await app.as(sam).call('addOrder', { customer: await customerId(app, 'Alan Turing'), total: 100 })
    assert.equal(forGrace.placedBy, graceUser)
    assert.equal(forAlan.placedBy, sam)
  } finally {
    await app.close()
  }
})

test('step 3 of the walk: the door refuses an order with no total, and names the field', async () => {
  const app = await testApp()
  try {
    const sam = await userId(app, 'sam@shop.example')
    const ada = await customerId(app, 'Ada Lovelace')
    await assert.rejects(
      app.as(sam).call('addOrder', { customer: ada }),
      (error: { code?: string; fields?: object }) => {
        assert.equal(error.code, 'T0002')
        assert.ok(error.fields && 'total' in error.fields)
        return true
      },
    )
    assert.equal((await app.rows('orders')).length, 40)
  } finally {
    await app.close()
  }
})

test('step 4 of the walk: an open order shows "Mark paid", and once it is marked paid it shows "paid" and no "Mark paid"', async () => {
  const app = await testApp()
  try {
    const sam = await userId(app, 'sam@shop.example')
    const [order] = await app.as(sam).call('ordersByStatus', { status: 'open' })
    assert.ok(order)
    const before = await app.as(sam).page(`/orders/${order.id}`)
    assert.equal(before.status, 200)
    assert.match(before.html, />Open</)
    assert.match(before.html, /<button[^>]*>(<svg[\s\S]*?<\/svg>)?Mark paid</)
    await app.as(sam).call('markPaid', { order: order.id })
    assert.equal((await app.as(sam).call('getOrder', { id: order.id }))?.status, 'paid')
    const after = await app.as(sam).page(`/orders/${order.id}`)
    assert.match(after.html, />Paid</)
    assert.doesNotMatch(after.html, /Mark paid/)
    assert.equal((await app.as(sam).call('ordersByStatus', { status: 'open' })).length, 7)
    await assert.rejects(app.as(sam).call('markPaid', { order: order.id }), { code: 'not-open' })
  } finally {
    await app.close()
  }
})

test('only staff mark an order paid, and an order that is not there is "not found" as a screen', async () => {
  const app = await testApp()
  try {
    const sam = await userId(app, 'sam@shop.example')
    const ada = await userId(app, 'ada@example.com')
    const [order] = await app.as(sam).call('ordersByStatus', { status: 'open' })
    assert.ok(order)
    await assert.rejects(app.as(ada).call('markPaid', { order: order.id }), { code: 'T3101' })
    assert.equal((await app.as(sam).page('/orders/01m4v0443hfnd99ka5b5d558xx')).status, 404)
  } finally {
    await app.close()
  }
})

test('staff add a customer, who is then in the list of customers', async () => {
  const app = await testApp()
  try {
    const sam = await userId(app, 'sam@shop.example')
    await app.as(sam).call('addCustomer', { name: 'Edsger Dijkstra', email: 'edsger@example.com' })
    const list = await app.as(sam).call('customerList', {})
    assert.deepEqual(
      list.map((customer) => customer.name),
      ['Ada Lovelace', 'Alan Turing', 'Edsger Dijkstra', 'Grace Hopper'],
    )
    assert.match((await app.as(sam).page('/customers')).html, />Edsger Dijkstra</)
  } finally {
    await app.close()
  }
})

test('step 7 of the walk: the paid orders come twenty a page, and the count says how many there are', async () => {
  const app = await testApp()
  try {
    const sam = await userId(app, 'sam@shop.example')
    const first = await app.as(sam).call('ordersByStatus', { status: 'paid', page: 1 })
    const second = await app.as(sam).call('ordersByStatus', { status: 'paid', page: 2 })
    assert.equal(first.length, 20)
    assert.equal(second.length, 5)
    assert.equal(new Set([...first, ...second].map((order) => order.id)).size, 25)
    assert.equal(await app.as(sam).call('orderCount', { status: 'paid' }), 25)
    const page = await app.as(sam).page('/orders?tab=paid&page=2')
    assert.equal(listed(page.html).length, 5)
    assert.match(page.html, />21 to 25 of 25</)
  } finally {
    await app.close()
  }
})

test("step 8 of the walk: a search by a customer's name narrows the orders and their count to that customer", async () => {
  const app = await testApp()
  try {
    const sam = await userId(app, 'sam@shop.example')
    const found = await app.as(sam).call('ordersByStatus', { status: 'paid', search: 'Grace Hopper' })
    assert.ok(found.length > 0)
    for (const order of found) assert.equal(order.customer.name, 'Grace Hopper')
    assert.equal(await app.as(sam).call('orderCount', { status: 'paid', search: 'Grace Hopper' }), found.length)
    assert.equal(await app.as(sam).call('orderCount', { status: 'paid', search: 'Nobody Here' }), 0)
  } finally {
    await app.close()
  }
})

test('step 9 of the walk: /tr/orders is in Turkish, with money and the month written the Turkish way', async () => {
  const app = await testApp()
  try {
    const sam = await userId(app, 'sam@shop.example')
    const page = await app.as(sam).page('/tr/orders')
    assert.equal(page.status, 200)
    assert.match(page.html, /<html[^>]* lang="tr"/)
    const first = listed(page.html)[0] ?? ''
    assert.match(first, />\$19,99</)
    assert.match(first, />11 Haz 2025</)
    assert.match(page.html, />Siparişler</)
  } finally {
    await app.close()
  }
})

test('step 11 of the walk: a customer reads their own orders and no other, and not the sums of the shop', async () => {
  const app = await testApp()
  try {
    const ada = await userId(app, 'ada@example.com')
    const mine = await app.as(ada).call('myOrders', {})
    const all = await app.rows('orders')
    assert.equal(mine.length, all.filter((order) => order.placedBy === ada).length)
    for (const order of mine) assert.equal(order.placedBy, ada)
    await assert.rejects(app.as(ada).call('orderStats', {}), { code: 'T3101' })
  } finally {
    await app.close()
  }
})

test('step 12 of the walk: a customer who asks for the order of another is answered "not found"', async () => {
  const app = await testApp()
  try {
    const ada = await userId(app, 'ada@example.com')
    const grace = await userId(app, 'grace@example.com')
    const theirs = (await app.rows('orders')).find((order) => order.placedBy === grace)
    assert.ok(theirs)
    assert.equal(await app.as(ada).call('getOrder', { id: String(theirs.id) }), undefined)
    assert.equal((await app.as(ada).page(`/orders/${theirs.id}`)).status, 404)
  } finally {
    await app.close()
  }
})

test('steps 11 and 14 of the walk: a sign-in with the right password works, and a wrong one is refused', async () => {
  const app = await testApp()
  try {
    const browser = app.browser()
    const wrong = await browser.call('signIn', { email: 'ada@example.com', password: 'not the one' })
    assert.equal(wrong.ok, false)
    const right = await browser.call('signIn', { email: 'Ada@Example.com ', password: 'a long secret' })
    assert.equal(right.ok, true)
    assert.equal((await browser.page('/mine')).status, 200)
    assert.equal((await app.browser().page('/mine')).status, 302)
  } finally {
    await app.close()
  }
})

test('the overview sums every order by its status, and is for staff', async () => {
  const app = await testApp()
  try {
    const sam = await userId(app, 'sam@shop.example')
    const stats = await app.as(sam).call('orderStats', {})
    assert.deepEqual(
      stats.statuses.map((one) => [one.status, one.count]),
      [
        ['open', 8],
        ['paid', 25],
        ['shipped', 7],
      ],
    )
    const all = await app.rows('orders')
    assert.equal(
      stats.statuses.reduce((sum, one) => sum + one.total, 0),
      all.reduce((sum, order) => sum + Number(order.total), 0),
    )
    assert.equal(stats.months.length, 6)
    assert.equal(stats.buyers.length, 3)
    const overview = await app.as(sam).page('/')
    if (overview.status !== 200) console.log(overview.html.slice(0, 3000))
    assert.equal(overview.status, 200)
  } finally {
    await app.close()
  }
})
