import { passwords, seed } from 'tentjs'

// Fixed moments four days apart, so the list has the same order on every run and the newest order falls in June.
const FIRST_DAY = Date.UTC(2025, 0, 6, 9, 0, 0)
const DAY = 24 * 60 * 60 * 1000

// Every person of the seed signs in with this password, on data of development and of test alone.
const SEED_PASSWORD = 'a long secret'

export default seed(async ({ db }) => {
  const password = await passwords.hash(SEED_PASSWORD)
  const sam = db.users.add({ email: 'sam@shop.example', name: 'Sam Carter', password, roles: ['staff'] })
  db.users.add({ email: 'dana@shop.example', name: 'Dana Whit', password, roles: ['staff'] })
  const adaUser = db.users.add({ email: 'ada@example.com', name: 'Ada Lovelace', password, roles: [] })
  const graceUser = db.users.add({ email: 'grace@example.com', name: 'Grace Hopper', password, roles: [] })

  const ada = db.customers.add({ name: 'Ada Lovelace', email: 'ada@example.com', tier: 'gold', user: adaUser.id })
  const grace = db.customers.add({
    name: 'Grace Hopper',
    email: 'grace@example.com',
    tier: 'standard',
    user: graceUser.id,
  })
  const alan = db.customers.add({ name: 'Alan Turing', email: 'alan@example.com', tier: 'standard' })

  const buyers = [
    { customer: ada.id, placedBy: adaUser.id },
    { customer: grace.id, placedBy: graceUser.id },
    { customer: alan.id, placedBy: sam.id },
  ]
  const notes = ['Gift wrap, please.', 'Leave at the side door.', undefined, undefined, 'Call before delivery.']

  // Forty orders, oldest first: twenty-five paid, seven shipped, and the eight open ones last, so they are the newest.
  for (let n = 0; n < 40; n++) {
    const status = n < 25 ? 'paid' : n < 32 ? 'shipped' : 'open'
    const last = n === 39
    const buyer = last ? buyers[0] : buyers[n % 3]
    if (!buyer) continue
    db.orders.add({
      customer: buyer.customer,
      placedBy: buyer.placedBy,
      total: last ? 1999 : 1250 + ((n * 2711) % 9000),
      note: notes[n % notes.length],
      status,
      placedAt: new Date(FIRST_DAY + n * 4 * DAY),
    })
  }
})
