import { action, allow, avg, boolean, calc, caller, change, count, each, fail, given, input, later, link, list, mail, now, number, object, query, role, round, settings, sum, text, where } from 'tentjs'
import intro from '../prompts/intro.txt'
import { customers, members, orders } from '../tables/shop'
import { shop } from '../tent'

const LABELS = { open: 'Open', paid: 'Paid', shipped: 'On its way' }
const PAGE = 20
const SIZES = [10, 20, 50]

export const openOrders = query('openOrders', {
  about: 'Open orders, newest first',
  input: { limit: number({ default: 50, max: 200 }), status: text({ optional: true }), after: text({ optional: true }) },
  access: 'signedIn',
  rows: orders
    .where({ status: given(input('status')), net: { above: 0, atMost: 1000000 }, note: { empty: false } })
    .with('customer')
    .sort('-placedAt', 'net')
    .limit(input('limit'))
    .skip(calc('*', input('limit'), 0))
    .after(input('after')),
  live: false,
  refresh: '1 minute',
  offer: ['api', 'cli'],
})

export const mineOrTheirs = query('mineOrTheirs', {
  input: { team: link('teams') },
  access: allow((user, input, db) => db.members.where({ team: input.team, user: user?.id, admin: true }).count() > 0),
  rows: orders
    .where({
      any: [{ placedBy: caller('id') }, { all: [{ status: 'open' }, { status: { not: 'paid' } }] }],
      not: { note: { contains: 'secret' } },
      customer: { in: customers.where({ team: input('team') }).pick(['id']) },
    })
    .oldest('placedAt')
    .pick(['id', 'net'])
    .first(),
})

export const totals = query('totals', {
  access: role('staff'),
  rows: orders.where({ status: 'paid' }).group('status', { total: sum('net'), mean: avg('gross'), n: count() }),
  heavy: true,
  deprecated: '2027-01-01',
})

export const howMany = query('howMany', {
  access: 'signedIn',
  rows: orders.count({ status: 'open' }),
})

export const oneOrder = query('oneOrder', {
  input: { order: link('orders') },
  access: 'signedIn',
  rows: orders.get(input('order')),
})

export const orderLabel = query('orderLabel', {
  input: { order: link('orders'), tab: text({ optional: true }), page: number({ default: 0 }) },
  access: 'signedIn',
  output: object({ label: text(), intro: text(), title: text(), first: text(), size: number(), support: text() }),
  run: ({ input, db, user }) => {
    const order = db.orders.get(input.order)
    if (!order || !user) fail('not-found', 'That order is not there.')
    const found = db.orders.where({ status: order.status })
    const page = found.limit(PAGE).skip(input.page * PAGE).all()
    return {
      label: LABELS[order.status] ?? LABELS['open'],
      intro,
      title: shop.options.title,
      first: shop.options.languages[0],
      size: SIZES[input.page] ?? SIZES[0] + page.length,
      support: settings.supportEmail,
    }
  },
})

export const markPaid = change('markPaid', {
  input: { order: link('orders') },
  access: 'signedIn',
  set: orders.change(input('order'), { status: 'paid', note: null }),
  danger: 'ask',
  offer: ['mcp'],
})

export const moveOrder = change('moveOrder', {
  input: { order: link('orders'), to: link('customers') },
  access: role('staff'),
  system: 'staff move any order',
  set: [
    orders.change(input('order'), { customer: input('to'), due: later(now(), '7 days') }),
    orders.add({ customer: input('to'), net: calc('*', 2, 50), note: 'moved' }),
    orders.remove(input('order')),
  ],
})

export const settle = change('settle', {
  input: { ids: list(link('orders')), vat: number({ default: 20 }), big: number() },
  access: role('staff'),
  system: 'staff settle any order',
  output: object({ count: number(), total: number(), big: number(), ok: boolean() }),
  run: ({ input, db, now }) => {
    const rows = db.system.orders.where({ id: { in: input.ids } }).all()
    const lines = each(rows, (o, i) => ({ id: o.id, at: i, gross: round(o.net * (1 + input.vat / 100), 2), big: o.net > input.big }))
    for (const line of lines) {
      if (line.big && !(line.at % 2 === 0)) {
        db.system.orders.change(line.id, { status: 'paid', due: later(now, '30 days') })
      } else if (line.gross - (input.big - 1) < -5) {
        db.system.orders.remove(line.id)
      } else {
        db.system.orders.change(line.id, { note: `Settled ${line.at + 1} of ${lines.length}: \`${line.gross}\` \${net}` })
      }
    }
    const { left, next } = { left: where(lines, { big: true }), next: undefined }
    return { count: rows.length, total: sum(lines, 'gross'), big: left.length, ok: next === undefined ? true : false }
  },
})

export const remind = action('remind', {
  input: { order: link('orders'), words: text({ optional: true }) },
  access: role('staff'),
  system: 'staff remind any customer',
  output: object({ ok: boolean() }),
  limits: { time: '1 minute' },
  run: async ({ input, db, user }) => {
    const order = await db.system.orders.where({ id: input.order }).with('customer').first()
    if (!order) return { ok: false }
    const text = (input.words ?? 'Your order waits.') + ' ' + (order.customer?.name || 'friend')
    await mail.send({ to: order.customer.email, subject: `Order ${order.id}`, text })
    await markPaid({ order: order.id })
    return { ok: !!user }
  },
})
