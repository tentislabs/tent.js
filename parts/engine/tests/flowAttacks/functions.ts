import { action, change, every, flow, input, list, number, query, start, text } from 'tentjs'
import { marks, staff, users } from './tables.ts'

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const removeUser = change('removeUser', {
  access: 'nobody',
  input: { user: text() },
  set: users.remove(input('user')),
})

export const addStaff = change('addStaff', {
  access: 'nobody',
  input: { name: text(), pay: number() },
  set: staff.add({ name: input('name'), pay: input('pay') }),
})

export const addMark = change('addMark', {
  access: 'anyone',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const allMarks = query('allMarks', { access: 'anyone', rows: marks.oldest('createdAt') })

// 2.22: a step whose `db` is limited to the starter of its run reads the staff, and answers the rows as they are.
export const paidStep = flow('paidStep', {
  as: 'starter',
  run: async ({ step, db }) => step('read the staff', () => db.staff.sort('name').all()),
})

// 4.15: what an action that a screen reads may not do with a flow.
export const marking = flow('marking', {
  as: 'starter',
  run: async ({ step }) => step('mark', () => addMark({ what: 'a run of marking' })),
})

export const callsFlow = action('callsFlow', {
  access: 'anyone',
  run: async () => marking(),
})

export const startsFlow = action('startsFlow', {
  access: 'anyone',
  run: async () => start(marking).run,
})

// An action whose work is a run: the read-only rule holds inside its work too (`31`, section 3, point 6).
export const heavyMarks = action('heavyMarks', {
  access: 'anyone',
  background: true,
  run: async () => {
    await addMark({ what: 'written by a read' })
    return 'marked'
  },
})

// 8.10: a run that outlives its starter.
export const outlives = flow('outlives', {
  as: 'starter',
  run: async ({ step }) => {
    await step('before', () => 'done')
    await step.wait('1 hour')
    await step('after', () => addMark({ what: 'after the wait' }))
  },
})

// The entry of a `step.first` that finished first is the one that the run goes on with, on every pass.
export const firstWins = flow('firstWins', {
  run: async ({ step }) => {
    const won = await step.first([
      () => step('slow', () => new Promise((done) => setTimeout(() => done('slow'), 300))),
      () => step('fast', () => 'fast'),
    ])
    await step.wait('1 hour', { name: 'pause' })
    return won
  },
})

// A run that fails as soon as it is taken up.
export const failsAtOnce = flow('failsAtOnce', {
  run: async () => {
    throw new Error('this run fails at once')
  },
})

// A step that starts a run and then fails once: its second try must find the run it started, and start none.
let kicks = 0
export const startsTwice = flow('startsTwice', {
  run: async ({ step }) =>
    step(
      'kick',
      async () => {
        start(failsAtOnce)
        kicks += 1
        // The started run has failed before the first try of this step ends.
        await new Promise((done) => setTimeout(done, 200))
        if (kicks === 1) throw new Error('the first try fails after the start')
        return kicks
      },
      { tries: 2 },
    ),
})

// An offered flow that anyone may call, and that outlasts the time of a call.
export const slowOffered = flow('slowOffered', {
  access: 'anyone',
  as: 'starter',
  input: { note: text({ optional: true }) },
  output: text(),
  run: async ({ step }) => {
    await step.wait('1 hour')
    return 'done'
  },
})

// A step on a thread after a step that failed for good and was caught, and after one that goes on after it failed.
export const heavyAfterFailure = flow('heavyAfterFailure', {
  run: async ({ step }) => {
    try {
      await step(
        'breaks',
        () => {
          throw new Error('this step fails for good')
        },
        { tries: 1 },
      )
    } catch {
      // The flow goes on without it.
    }
    const went = await step(
      'goes on',
      () => {
        throw new Error('this one fails too')
      },
      { tries: 1, onFail: 'goOn' },
    )
    return step('heavy', () => `heavy after ${went?.failed ? 'a failure' : 'nothing'}`, { background: true })
  },
})

// A flow of the clock that refuses a second run while one works.
export const everyMinute = flow('everyMinute', {
  on: every('1 minute'),
  together: { max: 1, then: 'refuse' },
  run: async ({ step }) => step('hold', () => new Promise((done) => setTimeout(() => done('held'), 1500))),
})

// A step on a thread in a run that runs as its starter, after code that reads who the starter is.
export const heavyAsStarter = flow('heavyAsStarter', {
  as: 'starter',
  run: async ({ step, user }) => {
    const id = user?.id ?? ''
    return step('heavy', () => `heavy for ${id.length > 0 ? 'a user' : 'nobody'}`, { background: true })
  },
})
