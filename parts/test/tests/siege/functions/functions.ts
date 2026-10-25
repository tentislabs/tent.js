import { action, anyone, change, flow, input, json, list, log, number, object, query, range, role, text, concat } from 'tentjs'
import { notes, orders, staff, words as wordTable } from '../tables/tables'

const open = anyone('an attack calls it')

// What a visitor is answered, and who they are taken for.

export const echo = query('echo', {
  access: open,
  input: { text: text(), n: number({ optional: true }), deep: json({ optional: true }) },
  output: json(),
  run: ({ input: given }) => {
    log.info('echo ran')
    return given
  },
})

export const whoAmI = query('whoAmI', {
  access: open,
  output: text(),
  run: ({ user }) => user?.id ?? 'no user',
})

export const forStaff = query('forStaff', { access: role('staff'), rows: wordTable.count() })

export const forSigned = query('forSigned', { access: 'signedIn', rows: wordTable.count() })

export const forNobody = query('forNobody', { access: 'nobody', rows: wordTable.count() })

// A flow that is offered to nobody: its name is no function.
export const sweep = flow('sweep', { run: async () => undefined })

// Rows that are another's.

export const addNote = change('addNote', {
  access: 'signedIn',
  input: { title: text(), secret: text({ optional: true }) },
  set: notes.add({ title: input('title'), secret: input('secret') }),
})

export const renameNote = change('renameNote', {
  access: open,
  input: { note: text(), title: text() },
  set: notes.change(input('note'), { title: input('title') }),
})

export const dropNote = change('dropNote', {
  access: open,
  input: { note: text() },
  set: notes.remove(input('note')),
})

// A column that is private, by every way a function answers.

export const paidOut = query('paidOut', {
  access: open,
  system: 'the page lists everyone at a desk',
  output: list(object({ name: text() })),
  run: ({ db }) => db.system.staff.sort('name').all(),
})

export const paidRaw = query('paidRaw', {
  access: open,
  system: 'the page lists everyone at a desk',
  run: ({ db }) => db.system.staff.sort('name').all(),
})

export const paidCopy = query('paidCopy', {
  access: open,
  system: 'the page lists everyone at a desk',
  run: ({ db }) =>
    db.system.staff
      .sort('name')
      .all()
      .map((row) => ({ ...row })),
})

export const paidChanged = query('paidChanged', {
  access: open,
  system: 'the page lists everyone at a desk',
  run: ({ db }) => {
    const rows = db.system.staff.sort('name').all()
    Object.assign(rows[0], { name: 'changed', leaked: rows[0].pay })
    return rows
  },
})

export const paidByDesk = query('paidByDesk', {
  access: open,
  rows: staff.group('desk', { n: { count: true } }),
})

export const paidGrouped = query('paidGrouped', {
  access: open,
  run: ({ db }) =>
    db.staff
      .sort('name')
      .group('pay', { n: { count: true }, all: { sum: 'pay' } })
      .all(),
})

export const paidSummed = query('paidSummed', {
  access: open,
  run: ({ db }) =>
    db.staff
      .sort('name')
      .group('desk', { all: { sum: 'pay' } })
      .all(),
})

export const paidAct = action('paidAct', {
  access: open,
  output: list(object({ name: text(), desk: text(), pay: number({ optional: true }) })),
  run: async ({ db }) => await db.staff.sort('name').all(),
})

// What a failure tells.

export const breaks = query('breaks', {
  access: open,
  input: { how: text() },
  run: ({ db, input: given }) => {
    if (given.how === 'data') return db.words.where({ nothing: 'here' }).all()
    throw new RangeError('the key of the vault is hunter2')
  },
})

export const logIn = query('logIn', {
  access: open,
  input: { name: text(), password: text({ secret: true, min: 8 }) },
  output: text(),
  run: ({ input: given }) => given.name,
})

export const addWord = change('addWord', {
  access: open,
  input: { text: text() },
  set: wordTable.add({ text: input('text') }),
})

export const wordCount = query('wordCount', { access: open, rows: wordTable.count() })

// Raw SQL of a function that states `system`: the text is the attacker's.

export const rawRead = query('rawRead', {
  access: open,
  system: 'an attack hands it a text of SQL',
  input: { sql: text() },
  output: json(),
  run: ({ db, input: given }) => db.sql(given.sql),
})

export const rawWrite = change('rawWrite', {
  access: open,
  system: 'an attack hands it a text of SQL',
  input: { sql: text() },
  output: json(),
  run: ({ db, input: given }) => db.sql(given.sql),
})

// A `run` made of our words alone, which never ends by itself.

export const walks = query('walks', {
  access: open,
  output: number(),
  run: () => {
    // A million walks of a million entries: no computer is quick enough to end it inside the time of a query.
    for (const j of range(0, 1_000_000)) for (const i of range(0, 1_000_000)) [j, i]
    return 1
  },
})

export const widens = query('widens', {
  access: open,
  output: number(),
  run: () => range(0, 10_000_000_000).length,
})

export const ping = query('ping', {
  access: open,
  input: { n: number() },
  output: number(),
  run: ({ input }) => pong({ n: input.n }),
})

export const pong = query('pong', {
  access: open,
  input: { n: number() },
  output: number(),
  run: ({ input }) => ping({ n: input.n }),
})

export const doubles = query('doubles', {
  access: open,
  output: number(),
  run: () => {
    const seed = '0123456789'
    const t1 = concat(seed, seed)
    const t2 = concat(t1, t1)
    const t3 = concat(t2, t2)
    const t4 = concat(t3, t3)
    const t5 = concat(t4, t4)
    const t6 = concat(t5, t5)
    const t7 = concat(t6, t6)
    const t8 = concat(t7, t7)
    const t9 = concat(t8, t8)
    const t10 = concat(t9, t9)
    const t11 = concat(t10, t10)
    const t12 = concat(t11, t11)
    const t13 = concat(t12, t12)
    const t14 = concat(t13, t13)
    const t15 = concat(t14, t14)
    const t16 = concat(t15, t15)
    const t17 = concat(t16, t16)
    const t18 = concat(t17, t17)
    const t19 = concat(t18, t18)
    const t20 = concat(t19, t19)
    const t21 = concat(t20, t20)
    const t22 = concat(t21, t21)
    const t23 = concat(t22, t22)
    const t24 = concat(t23, t23)
    const t25 = concat(t24, t24)
    const t26 = concat(t25, t25)
    const t27 = concat(t26, t26)
    const t28 = concat(t27, t27)
    const t29 = concat(t28, t28)
    const t30 = concat(t29, t29)
    const t31 = concat(t30, t30)
    const t32 = concat(t31, t31)
    const t33 = concat(t32, t32)
    const t34 = concat(t33, t33)
    const t35 = concat(t34, t34)
    const t36 = concat(t35, t35)
    const t37 = concat(t36, t36)
    const t38 = concat(t37, t37)
    const t39 = concat(t38, t38)
    const t40 = concat(t39, t39)
    return t40.length
  },
})

// A member that is called on a name which holds a text makes a `run` code, and the same `run` without it is plain.
export const shouts = query('shouts', {
  access: open,
  input: { text: text() },
  output: text(),
  run: ({ input }) => {
    const said = input.text
    return said.toUpperCase()
  },
})

export const whispers = query('whispers', {
  access: open,
  input: { text: text() },
  output: text(),
  run: ({ input }) => {
    const said = input.text
    return said
  },
})

// The orders of a team, which stand in the data file of that team.

export const listOrders = query('listOrders', {
  access: open,
  input: { team: text() },
  rows: orders.of(input('team')).oldest('createdAt').limit(100),
})

export const countOrders = query('countOrders', {
  access: open,
  input: { team: text() },
  output: number(),
  run: ({ db, input: given }) => db.orders.of(given.team).count(),
})

export const addOrder = change('addOrder', {
  access: open,
  input: { team: text(), title: text() },
  set: orders.of(input('team')).add({ title: input('title') }),
})

export const renameOrder = change('renameOrder', {
  access: open,
  input: { team: text(), order: text(), title: text() },
  set: orders.of(input('team')).change(input('order'), { title: input('title') }),
})
