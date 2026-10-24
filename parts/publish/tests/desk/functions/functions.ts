import { action, allow, anyone, change, input, list, number, query, text } from 'tentjs'
import { lines, orders, teams, users } from '../tables/tables'

const open = anyone('a test calls it')

export const addTeam = change('addTeam', {
  access: open,
  input: { name: text() },
  set: teams.add({ name: input('name') }),
})

export const addOrder = change('addOrder', {
  access: open,
  input: { team: text(), title: text(), code: text({ optional: true }), placedBy: text({ optional: true }) },
  set: orders.of(input('team')).add({ title: input('title'), code: input('code'), placedBy: input('placedBy') }),
})

export const addLine = change('addLine', {
  access: open,
  input: { team: text(), order: text(), qty: number() },
  set: lines.of(input('team')).add({ order: input('order'), qty: input('qty') }),
})

export const listOrders = query('listOrders', {
  access: open,
  input: { team: text() },
  rows: orders.of(input('team')).oldest('createdAt').limit(1000),
})

// A query in code that catches what its read throws: a file that is behind is none of its business.
export const countOrders = query('countOrders', {
  access: open,
  input: { team: text() },
  output: number(),
  run: ({ db, input: given }) => {
    try {
      return db.orders.of(given.team).count()
    } catch {
      return -1
    }
  },
})

// A change in code that reads the file of its team before it writes it.
export const addCounted = change('addCounted', {
  access: open,
  input: { team: text() },
  output: number(),
  run: ({ db, input: given }) => {
    const held = db.orders.of(given.team).count()
    db.orders.of(given.team).add({ title: `order ${held + 1}` })
    return held + 1
  },
})

// A change in code that works for some time between its read and its write, and catches what its read throws.
export const addSlowly = change('addSlowly', {
  access: open,
  input: { team: text(), ms: number() },
  output: number(),
  run: ({ db, input: given }) => {
    let held = -1
    try {
      held = db.orders.of(given.team).count()
    } catch {
      // A file that is behind is none of its business.
    }
    const until = performance.now() + given.ms
    while (performance.now() < until);
    db.orders.of(given.team).add({ title: `order ${held + 1}` })
    return held + 1
  },
})

// An action reads through promises: one that names a file which is not ready waits for it.
export const countLater = action('countLater', {
  access: open,
  input: { team: text() },
  output: number(),
  run: async ({ db, input: given }) => await db.orders.of(given.team).count(),
})

// The rule of an action is code that reads the file of a team, under the rules of its caller, before the action runs.
export const countRuled = action('countRuled', {
  access: allow((_user, given, db) => db.orders.of(String(given.team)).count() > 0),
  input: { team: text() },
  output: number(),
  run: async ({ db, input: given }) => await db.orders.of(given.team).count(),
})

// Many rows at once, by raw SQL in the file of a team that holds the table already.
export const fill = change('fill', {
  access: open,
  input: { team: text(), from: number(), to: number() },
  system: 'a test fills the file of a team with many rows at once',
  touches: ['orders'],
  run: ({ db, input: given, now }) => {
    db.sql(
      `WITH RECURSIVE n(i) AS (SELECT ? UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO "orders" ("id", "createdAt", "updatedAt", "team", "title", "total")
       SELECT printf('%026d', i), ?, ?, ?, 'order ' || i, i FROM n`,
      [given.from, given.to, now.getTime(), now.getTime(), given.team],
      { of: given.team },
    )
  },
})

export const heavyOrders = query('heavyOrders', {
  access: open,
  input: { team: text() },
  heavy: true,
  run: ({ db, input: given }) => db.orders.of(given.team).oldest('createdAt').all(),
})

export const removeUser = change('removeUser', {
  access: open,
  input: { user: text() },
  set: users.remove(input('user')),
})

export const removeTeam = change('removeTeam', {
  access: open,
  input: { team: text() },
  set: teams.remove(input('team')),
})

// A query that reads the orders of several teams in turn, each in the file of its team: one query to the door and
// to a live page.
export const ordersOf = query('ordersOf', {
  access: open,
  input: { teams: list(text()) },
  output: list(text()),
  system: 'a test reads the orders of every team that it names',
  run: ({ db, input: given }) =>
    given.teams.flatMap((team) =>
      db.system.orders
        .of(team)
        .oldest('createdAt')
        .all()
        .map((order) => order.title),
    ),
})
