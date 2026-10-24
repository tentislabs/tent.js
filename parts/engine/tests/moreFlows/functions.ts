import {
  action,
  boolean,
  change,
  emit,
  event,
  fail,
  flow,
  input,
  list,
  number,
  object,
  query,
  runs,
  start,
  text,
} from 'tentjs'
import { marks, users } from './tables.ts'

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const addMark = change('addMark', {
  access: 'signedIn',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const allMarks = query('allMarks', { access: 'nobody', rows: marks.oldest('createdAt') })

// Holds the work of a step until a mark lets it go, so that its run stays at work.
const held = async (db, name) => {
  while (!(await db.marks.where({ what: `go ${name}` }).first())) await new Promise((done) => setTimeout(done, 5))
  return name
}

// One run for each order: a start of an order whose run is under way joins it, and a cancel of the order stops it.

export const ship = flow('ship', {
  input: { order: text() },
  key: ({ input }) => input.order,
  together: { then: 'join' },
  stopOn: event('order.cancelled', { key: ({ data }) => data.order }),
  run: async ({ input, step }) => {
    await step('pack', () => addMark({ what: `packed ${input.order}` }))
    await step.waitFor('handed over')
    return `shipped ${input.order}`
  },
})

export const shipThrice = action('shipThrice', {
  access: 'nobody',
  input: { order: text() },
  output: list(text()),
  run: async ({ input }) => [1, 2, 3].map(() => start(ship, { order: input.order }).run),
})

export const cancel = change('cancel', {
  access: 'nobody',
  input: { order: text() },
  run: ({ input }) => {
    emit('order.cancelled', { order: input.order })
  },
})

export const cancelAndFail = change('cancelAndFail', {
  access: 'nobody',
  input: { order: text() },
  run: ({ input }) => {
    emit('order.cancelled', { order: input.order })
    fail('kept', 'The cancel fails after it sent its event.')
  },
})

export const runsOfOrder = action('runsOfOrder', {
  access: 'nobody',
  system: 'it reads the runs of an order',
  input: { order: text() },
  output: list(text()),
  run: async ({ input }) => (await runs.find({ flow: 'ship', key: input.order })).map((one) => one.id),
})

// Two flows that share one limit: five runs of either at once for one team.

export const teamReport = flow('teamReport', {
  input: { team: text(), name: text() },
  key: ({ input }) => input.team,
  together: { group: 'perTeam', max: 5 },
  run: async ({ input, step, db }) => step('hold', () => held(db, input.name)),
})

export const teamExport = flow('teamExport', {
  input: { team: text(), name: text() },
  key: ({ input }) => input.team,
  together: { group: 'perTeam', max: 5 },
  run: async ({ input, step, db }) => step('hold', () => held(db, input.name)),
})

// Jobs that break at their first step where they are told to, and else wait for a word to end.

export const job = flow('job', {
  input: { name: text(), breaks: boolean() },
  key: ({ input }) => input.name,
  run: async ({ input, step }) => {
    await step('work', () => {
      if (input.breaks) fail('broken', `The job ${input.name} broke.`)
      return input.name
    })
    await step.waitFor('done')
    return input.name
  },
})

const counted = object({ count: number(), runs: list(text()), started: list(text(), { optional: true }) })

export const stopJobs = action('stopJobs', {
  access: 'nobody',
  system: 'it stops the jobs of a state since a moment',
  input: { state: text(), since: number() },
  output: counted,
  run: async ({ input }) => runs.stopAll({ flow: 'job', state: input.state, since: input.since }),
})

export const replayJobs = action('replayJobs', {
  access: 'nobody',
  system: 'it replays the jobs of a state since a moment',
  input: { state: text(), since: number() },
  output: counted,
  run: async ({ input }) => runs.replayAll({ flow: 'job', state: input.state, since: input.since, from: 'work' }),
})

export const stopJobsUnheld = action('stopJobsUnheld', {
  access: 'signedIn',
  output: counted,
  run: async () => runs.stopAll({ flow: 'job' }),
})

// A flow that a test pauses: each run marks, waits an hour, and marks again, one run at a time.

export const tick = flow('tick', {
  input: { name: text() },
  together: { max: 1 },
  run: async ({ input, step }) => {
    await step('before', () => addMark({ what: `before ${input.name}` }))
    await step.wait('1 hour')
    await step('after', () => addMark({ what: `after ${input.name}` }))
  },
})
