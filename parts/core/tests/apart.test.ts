import assert from 'node:assert/strict'
import { test } from 'node:test'
import { caller, change, input, link, number, project, query, seed, table, text, where } from '../index.ts'
import { checkDescription, describe } from '../internal.ts'

const shop = project('shop', {})
const teams = table('teams', { columns: { name: text() }, access: { read: 'signedIn' } })
const clinics = table('clinics', { columns: { name: text() } })
const members = table('members', {
  columns: { team: link('teams'), user: link('users') },
  access: { read: 'signedIn' },
})
const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), total: number(), status: text() },
  tenant: 'team',
  access: { read: where({ team: { in: members.where({ user: caller('id') }).pick(['team']) } }) },
})
// A line is read by who may read its order: the plan inside its rule is written without `of`.
const lines = table('lines', {
  columns: { team: link('teams', { onRemove: 'remove' }), order: link('orders'), qty: number() },
  tenant: 'team',
  access: { read: where({ order: { in: orders.where({ status: 'open' }).pick(['id']) } }) },
})
const access = 'signedIn'
const inputs = { team: link('teams'), order: link('orders'), total: number() }
const base = [shop, teams, clinics, members, orders, lines]

/** Describes the tables with more definitions, and answers the description and the codes that were found with their words. */
function described(more: object[], bodies: Record<string, object[]> = {}) {
  const { description, findings } = describe({
    definitions: [...base, ...more].map((value) => {
      const run = bodies[String(Reflect.get(value, 'definition'))]
      return run ? { value, bodies: { run } } : { value }
    }),
  })
  return { description, found: findings.map((one) => `${one.code} ${one.message}`) }
}

test('[50-1] a table with tenant, and a plan and a write with of, are stored as the format gives them, and a chain that does not begin with of is refused', () => {
  const open = query('open', {
    access,
    input: inputs,
    rows: orders.of(input('team')).where({ status: 'open' }).newest('total').limit(50),
  })
  const one = query('one', { access, input: inputs, rows: orders.of(input('team')).get(input('order')) })
  const count = query('count', { access, rows: orders.of('team-1').count({ status: 'open' }) })
  const add = change('add', { access, input: inputs, set: orders.of(input('team')).add({ total: input('total') }) })
  const pay = change('pay', {
    access,
    input: inputs,
    set: [
      orders.of(input('team')).change(input('order'), { status: 'paid' }),
      orders.of(input('team')).remove(input('order')),
    ],
  })
  const body = [
    {
      return: {
        plan: { db: 'orders' },
        then: [{ of: [{ name: ['input', 'team'] }] }, { where: [{ object: [['status', 'open']] }] }, { all: [] }],
      },
    },
  ]
  const read = query('read', { access, run: () => undefined })
  const starter = seed([orders.of('team-1').add({ total: 5 })])
  const { description, found } = described([open, one, count, add, pay, read, starter], { read: body })
  assert.deepEqual(found, [])
  assert.deepEqual(checkDescription(description), [])
  assert.deepEqual(
    [description.tables.orders.tenant, description.tables.lines.tenant, description.tables.teams.tenant],
    ['team', 'team', undefined],
  )
  assert.deepEqual(description.tables.orders.columns, {
    team: { kind: 'link', table: 'teams', onRemove: 'remove' },
    total: { kind: 'number' },
    status: { kind: 'text' },
  })
  const team = { input: 'team' }
  assert.deepEqual(description.functions.open.plan, {
    from: 'orders',
    of: team,
    where: { col: 'status', is: 'open' },
    sort: [{ by: 'total', down: true }],
    limit: 50,
  })
  assert.deepEqual(description.functions.one.plan, { from: 'orders', of: team, one: 'get', id: { input: 'order' } })
  assert.deepEqual(description.functions.count.plan, {
    from: 'orders',
    of: 'team-1',
    where: { col: 'status', is: 'open' },
    count: true,
  })
  assert.deepEqual(description.functions.add.writes, [
    { add: 'orders', of: team, values: { total: { input: 'total' } } },
  ])
  assert.deepEqual(description.functions.pay.writes, [
    { change: 'orders', of: team, id: { input: 'order' }, values: { status: 'paid' } },
    { remove: 'orders', of: team, id: { input: 'order' } },
  ])
  assert.deepEqual(description.seed, { writes: [{ add: 'orders', of: 'team-1', values: { total: 5 } }] })
  // No other plan and no other write holds it, and the plan inside the rule of `lines` holds none.
  assert.deepEqual(description.tables.lines.access, {
    read: {
      rule: 'where',
      filter: { col: 'order', in: { from: 'orders', where: { col: 'status', is: 'open' }, pick: ['id'] } },
    },
  })
  assert.deepEqual(Reflect.get(teams.where({ name: 'a' }), 'plan'), { from: 'teams', where: { col: 'name', is: 'a' } })

  // A chain on a tenant table that does not begin with `of` is refused, wherever it stands.
  const refused: [string, object[], Record<string, object[]>?][] = [
    ['a plan of a query', [query('q', { access, rows: orders.where({ status: 'open' }) })]],
    ['a get', [query('q', { access, rows: orders.get('o1') })]],
    ['a write', [change('q', { access, set: orders.add({ total: 1 }) })]],
    [
      'one write of two',
      [change('q', { access, input: inputs, set: [orders.of(input('team')).add({ total: 1 }), lines.remove('l1')] })],
    ],
    [
      'a plan inside the filter of a plan',
      [query('q', { access, rows: teams.where({ id: { in: orders.where({ status: 'open' }).pick(['team']) } }) })],
    ],
    [
      'a plan inside the rule of a table of the shared file',
      [table('notes', { columns: { a: text() }, access: { read: where({ a: { in: orders.pick(['status']) } }) } })],
    ],
    [
      'a plan inside the rule of a tenant table whose tenants are of another table',
      [
        table('visits', {
          columns: { clinic: link('clinics', { onRemove: 'remove' }) },
          tenant: 'clinic',
          access: { read: where({ id: { in: orders.pick(['id']) } }) },
        }),
      ],
    ],
    ['the starter data', [seed([orders.add({ total: 5 })])]],
    [
      'a chain of a body',
      [read],
      {
        read: [
          { return: { plan: { db: 'orders' }, then: [{ where: [{ object: [['status', 'open']] }] }, { all: [] }] } },
        ],
      },
    ],
    [
      'a chain of a body at an imported table',
      [read],
      { read: [{ return: { plan: { table: 'lines' }, then: [{ pick: [['id']] }] } }] },
    ],
  ]
  for (const [what, more, bodies] of refused) {
    const { found: codes } = described(more, bodies)
    assert.equal(codes.length, 1, `${what}: ${JSON.stringify(codes)}`)
    assert.match(
      codes[0],
      /^T2013 \w+: a chain on `(orders|lines)`, which is a tenant table, does not begin with `of`\.$/,
      what,
    )
  }
  // No other table has `of`.
  const other = described([query('q', { access, rows: teams.of('t1').where({ name: 'a' }) })]).found
  assert.deepEqual(other, ['T2013 q: a chain on `teams` begins with `of`, and the table is no tenant table.'])
})
