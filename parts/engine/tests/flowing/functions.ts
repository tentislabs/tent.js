import {
  action,
  anyone,
  boolean,
  change,
  date,
  emit,
  event,
  every,
  fail,
  flow,
  input,
  list,
  now,
  number,
  object,
  query,
  role,
  runs,
  start,
  text,
} from 'tentjs'
import { customers, marks, notes, orders, users } from './tables.ts'

// The functions that the flows call.

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const addMark = change('addMark', {
  access: 'signedIn',
  input: { what: text(), by: text({ optional: true }) },
  set: marks.add({ what: input('what'), by: input('by') }),
})

export const allMarks = query('allMarks', { access: 'nobody', rows: marks.oldest('createdAt') })

export const addCustomer = change('addCustomer', {
  access: 'nobody',
  input: { name: text(), tier: text() },
  set: customers.add({ name: input('name'), tier: input('tier') }),
})

export const addOrders = change('addOrders', {
  access: 'nobody',
  input: { customer: text(), count: number(), status: text() },
  run: ({ input, db }) => {
    for (let n = 0; n < input.count; n += 1) db.orders.add({ customer: input.customer, total: n, status: input.status })
  },
})

export const changeOrder = change('changeOrder', {
  access: 'nobody',
  input: { order: text(), total: number({ optional: true }), status: text({ optional: true }) },
  run: ({ input, db }) => {
    db.orders.change(input.order, { ...(input.total === undefined ? {} : { total: input.total }), ...(input.status === undefined ? {} : { status: input.status }) })
  },
})

export const myNotes = query('myNotes', { access: 'signedIn', rows: notes.oldest('createdAt') })

export const addNote = change('addNote', {
  access: 'signedIn',
  input: { title: text() },
  set: notes.add({ title: input('title') }),
})

export const staffOnly = query('staffOnly', { access: role('staff'), rows: marks.count() })

// A change that starts a flow, and may fail after it.

export const greet = flow('greet', {
  input: { name: text() },
  run: async ({ input, step }) => {
    await step('mark', () => addMark({ what: `greeted ${input.name}` }))
    return `hello ${input.name}`
  },
})

export const startGreeting = change('startGreeting', {
  access: 'nobody',
  input: { name: text(), fails: boolean() },
  output: text(),
  run: ({ input }) => {
    const { run } = start(greet, { name: input.name })
    if (input.fails) fail('not-today', 'The change fails after it started the flow.')
    return run
  },
})

export const startInAction = action('startInAction', {
  access: 'nobody',
  input: { name: text() },
  output: text(),
  run: async ({ input }) => start(greet, { name: input.name }).run,
})

export const startBadly = action('startBadly', {
  access: 'nobody',
  run: async () => start(greet, { name: 7 }),
})

export const startInQuery = query('startInQuery', {
  access: 'nobody',
  output: text(),
  run: () => start(greet, { name: 'never' }).run,
})

// Table triggers.

export const onOpenOrder = flow('onOpenOrder', {
  on: orders.added({ where: { status: 'open' } }),
  run: async ({ event, step }) => {
    await step('mark', () => addMark({ what: `order ${event.row.id}`, by: typeof event.row.customer }))
  },
})

export const onGoldOrder = flow('onGoldOrder', {
  on: orders.added({ where: { 'customer.tier': 'gold' } }),
  run: async ({ event, step }) => {
    await step('mark', () => addMark({ what: `gold ${event.row.id}`, by: String(event.row.customer) }))
  },
})

export const onGoldTotal = flow('onGoldTotal', {
  on: orders.changed({ where: { 'customer.tier': 'gold' }, columns: ['total'] }),
  run: async ({ event, step }) => {
    await step('mark', () => addMark({ what: `total ${event.before.total} to ${event.row.total}`, by: event.columns.join(',') }))
  },
})

// Limits.

const steps = async (step, count) => {
  let done = 0
  for (let n = 0; n < count; n += 1) done += await step('one', () => 1)
  return done
}

export const manySteps = flow('manySteps', {
  input: { count: number() },
  run: ({ input, step }) => steps(step, input.count),
})

export const moreSteps = flow('moreSteps', {
  input: { count: number() },
  limits: { steps: 1200 },
  run: ({ input, step }) => steps(step, input.count),
})

export const largeAnswer = flow('largeAnswer', { run: async () => 'a'.repeat(1_100_000) })

export const largerAnswer = flow('largerAnswer', {
  limits: { result: '2 MB' },
  run: async () => 'a'.repeat(1_100_000).length > 0,
})

export const largeResult = flow('largeResult', {
  run: async ({ step }) => step('large', () => 'a'.repeat(1_100_000), { tries: 1 }),
})

export const longWait = flow('longWait', { run: async ({ step }) => step.wait('2 years') })

export const longerWait = flow('longerWait', {
  limits: { wait: '3 years' },
  run: async ({ step }) => step.wait('2 years'),
})

const busy = (ms) => {
  const until = performance.now() + ms
  while (performance.now() < until);
}

export const slowPass = flow('slowPass', {
  limits: { pass: '20 ms' },
  run: async ({ step }) => {
    await step('first', () => 1)
    busy(60)
    return step('second', () => 2)
  },
})

export const slowerPass = flow('slowerPass', {
  limits: { pass: '10 seconds' },
  run: async ({ step }) => {
    await step('first', () => 1)
    busy(60)
    return step('second', () => 2)
  },
})

export const longRun = flow('longRun', {
  limits: { time: '20 ms' },
  run: async ({ step }) => {
    await step('first', () => busy(60))
    return step('second', () => 2)
  },
})

export const longerRun = flow('longerRun', {
  limits: { time: '10 seconds' },
  run: async ({ step }) => {
    await step('first', () => busy(60))
    return step('second', () => 2)
  },
})

// Runs of one flow that work at the same time: each holds its turn until a mark lets it go.
const held = async (db, name) => {
  while (!(await db.marks.where({ what: `go ${name}` }).first())) await new Promise((done) => setTimeout(done, 5))
  return name
}

export const oneAtATime = flow('oneAtATime', {
  input: { name: text() },
  together: { max: 1 },
  run: async ({ input, step, db }) => step('hold', () => held(db, input.name)),
})

export const refusesMore = flow('refusesMore', {
  input: { name: text() },
  together: { max: 1, then: 'refuse' },
  run: async ({ input, step, db }) => step('hold', () => held(db, input.name)),
})

// A flow that calls a flow.

export const inner = flow('inner', {
  input: { name: text() },
  run: async ({ input, step }) => {
    await step('mark', () => addMark({ what: `inner ${input.name}` }))
    const said = await step.waitFor('go on')
    return { name: input.name, approved: said.approved }
  },
})

export const middle = flow('middle', {
  input: { name: text() },
  run: async ({ input, step }) => step('call inner', () => inner({ name: input.name })),
})

export const outer = flow('outer', {
  input: { name: text() },
  run: async ({ input, step }) => step('call middle', () => middle({ name: input.name })),
})

// Three runs that call each other, of which the third calls a fourth: each step is tried once.
export const deepThree = flow('deepThree', {
  run: async ({ step }) => step('call a fourth', () => greet({ name: 'too deep' }), { tries: 1 }),
})

export const deepTwo = flow('deepTwo', {
  run: async ({ step }) => step('call a third', () => deepThree(), { tries: 1 }),
})

export const deepOne = flow('deepOne', {
  run: async ({ step }) => step('call a second', () => deepTwo(), { tries: 1 }),
})

export const flowInQuery = query('flowInQuery', {
  access: 'nobody',
  output: text(),
  run: () => String(greet({ name: 'never' })),
})

export const callGreet = action('callGreet', {
  access: 'nobody',
  system: 'it calls a flow that has full access, and waits for it',
  input: { name: text() },
  output: text(),
  run: async ({ input }) => greet({ name: input.name }),
})

export const callGreetBadly = action('callGreetBadly', {
  access: 'nobody',
  system: 'it calls a flow that has full access, and waits for it',
  run: async () => greet({ name: 7 }),
})

// A step that runs twice.

export const twoChanges = flow('twoChanges', {
  run: async ({ step, db }) =>
    step('both', async () => {
      const tried = await db.marks.where({ what: 'both: first try' }).count()
      // The two calls land in the other order on the second try.
      const calls = [() => addMark({ what: 'both: a' }), () => addMark({ what: 'both: b' })]
      await Promise.all((tried ? calls.reverse() : calls).map((call) => call()))
      const { run } = start(greet, { name: 'from a step' })
      // The second try calls one change more, which the first try never made.
      if (tried) await addMark({ what: 'both: only the second try' })
      else {
        await addMark({ what: 'both: first try' })
        throw new Error('the step fails after its changes were written')
      }
      return run
    }),
})

// Waiting for an event.

export const ship = change('ship', {
  access: 'nobody',
  input: { order: text(), carrier: text() },
  run: ({ input }) => {
    emit('order.shipped', { order: input.order, carrier: input.carrier })
  },
})

export const emitInAction = action('emitInAction', {
  access: 'nobody',
  run: async () => {
    emit('order.shipped', { order: 'none' })
  },
})

export const awaitShipping = flow('awaitShipping', {
  input: { order: text() },
  run: async ({ input, step }) => {
    const shipped = await step.waitFor(event('order.shipped'), { where: { order: input.order }, timeout: '2 days' })
    return shipped.timedOut ? 'never shipped' : `shipped by ${shipped.data.carrier}`
  },
})

export const onShipped = flow('onShipped', {
  on: event('order.shipped'),
  run: async ({ event, step }) => {
    await step('mark', () => addMark({ what: `event ${event.name} ${event.data.order}` }))
  },
})

// Flows that the pages of the app may call.

export const welcome = flow('welcome', {
  access: 'signedIn',
  as: 'starter',
  input: { name: text(), wait: boolean({ optional: true }) },
  output: object({ greeting: text() }),
  run: async ({ input, user, step }) => {
    await step('mark', () => addMark({ what: `welcome ${input.name}`, by: user?.id }))
    if (input.wait) await step.waitFor('go on')
    return { greeting: `welcome ${input.name}`, secret: 'no caller is handed this' }
  },
})

export const staffWelcome = flow('staffWelcome', {
  access: role('staff'),
  as: 'starter',
  input: { name: text() },
  run: async ({ input }) => `no output is stated, so ${input.name} is handed nothing`,
})

// Whose rights a call from a step has.

export const asStarter = flow('asStarter', {
  as: 'starter',
  run: async ({ user, step, db }) => {
    const mine = await step('my notes', () => myNotes())
    const staff = await step('staff only', () => staffOnly(), { onFail: 'goOn' })
    const direct = await db.notes.count()
    return { user: user?.id, mine: mine.length, staff: staff?.failed ? staff.code : staff, direct }
  },
})

export const asSystem = flow('asSystem', {
  run: async ({ user, step, db }) => {
    const all = await step('every note', () => myNotes())
    const staff = await step('staff only', () => staffOnly())
    return { user: user?.id ?? 'no user', all: all.length, staff, direct: await db.notes.count() }
  },
})

// The handle of runs.

export const runOf = action('runOf', {
  access: anyone('a page of the tests reads it'),
  system: 'it reads the runs of the app',
  input: { run: text() },
  output: text(),
  run: async ({ input }) => (await runs.read(input.run))?.state ?? 'no such run',
})

export const stopRun = action('stopRun', {
  access: anyone('a page of the tests reads it'),
  system: 'it stops a run',
  input: { run: text() },
  run: async ({ input }) => {
    await runs.stop(input.run)
  },
})

export const approveRun = action('approveRun', {
  access: 'nobody',
  system: 'it answers a step that waits for a person',
  input: { run: text(), step: text(), yes: boolean() },
  run: async ({ input }) => {
    if (input.yes) await runs.approve(input.run, input.step, { by: 'the action' })
    else await runs.refuse(input.run, input.step)
  },
})

export const findRuns = action('findRuns', {
  access: 'signedIn',
  input: { flow: text() },
  output: number(),
  run: async ({ input }) => (await runs.find({ flow: input.flow })).length,
})

// Work outside a step.

export const outsideStep = flow('outsideStep', {
  input: { what: text() },
  run: async ({ input, step, db }) => {
    // Reading is allowed between two steps.
    const before = await db.marks.count()
    const marks = allMarks().length
    if (input.what === 'change') await addMark({ what: 'outside a step' })
    if (input.what === 'action') await startInAction({ name: 'outside' })
    if (input.what === 'flow') await greet({ name: 'outside' })
    if (input.what === 'start') start(greet, { name: 'outside' })
    if (input.what === 'now') now()
    if (input.what === 'handle') await runs.stop('none')
    return step('after', () => before + marks)
  },
})

// A step that is done, and one that waits for a person.

export const waitsForPerson = flow('waitsForPerson', {
  input: { since: date({ optional: true }) },
  run: async ({ step }) => {
    await step('before', () => 'done')
    const said = await step.waitFor('approval', { show: { ask: 'May it go on?' } })
    return said
  },
})

export const daily = flow('daily', {
  on: every('day at 09:00'),
  run: async ({ event, step }) => {
    await step('mark', () => addMark({ what: `daily ${event.at.toISOString()}` }))
  },
})
