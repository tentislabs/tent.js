import { action, change, flow, input, json, list, number, query, start, text } from 'tentjs'
import { batchedRows, droppedRows, marks, rankedRows, throttledRows } from './tables.ts'

export const addMark = change('addMark', {
  access: 'signedIn',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const allMarks = query('allMarks', { access: 'nobody', rows: marks.oldest('createdAt') })

// Adds a row to the table that is named, and answers it.
const adding = (name, table) =>
  change(name, {
    access: 'nobody',
    input: { name: text(), rank: number({ optional: true }) },
    set: table.add({ name: input('name'), ...(table === rankedRows ? { rank: input('rank') } : {}) }),
  })

export const addThrottled = adding('addThrottled', throttledRows)
export const addDropped = adding('addDropped', droppedRows)
export const addBatched = adding('addBatched', batchedRows)
export const addRanked = adding('addRanked', rankedRows)

export const renameRow = change('renameRow', {
  access: 'nobody',
  input: { table: text(), id: text(), name: text() },
  run: ({ input, db }) => {
    db[input.table].change(input.id, { name: input.name })
  },
})

// Holds the work of a step until a mark lets it go, so that its run stays at work.
const held = async (db, name) => {
  while (!(await db.marks.where({ what: `go ${name}` }).first())) await new Promise((done) => setTimeout(done, 5))
  return name
}

// Four flows on a table trigger, none of which writes a key: each part of their pace is held for each row.

export const throttledRow = flow('throttledRow', {
  on: throttledRows.changed(),
  pace: { perMinute: 2 },
  run: async ({ event, step }) => {
    await step('note', () => addMark({ what: `throttled ${event.row.name}` }))
  },
})

export const droppedRow = flow('droppedRow', {
  on: droppedRows.changed(),
  pace: { drop: { max: 1, per: '1 hour' } },
  run: async ({ event, step }) => {
    await step('note', () => addMark({ what: `dropped ${event.row.name}` }))
  },
})

export const batchedRow = flow('batchedRow', {
  on: batchedRows.changed(),
  pace: { batch: { max: 2, wait: '10 seconds' } },
  run: async ({ events, step }) => {
    await step('note', () => addMark({ what: `batched ${events.map((one) => one.row.name).join(' ')}` }))
  },
})

export const rankedRow = flow('rankedRow', {
  on: rankedRows.changed(),
  together: { max: 1 },
  pace: { order: ({ event }) => event.row.rank, turns: 'key' },
  run: async ({ event, step, db }) => {
    if (event.row.name === 'holder') await step('hold', () => held(db, 'holder'))
    else await step('note', () => addMark({ what: `ranked ${event.row.name}` }))
  },
})

// A flow that one run an hour may start: every other start is dropped.

export const once = flow('once', {
  pace: { drop: { max: 1, per: '1 hour' } },
  run: async ({ step }) => step('note', () => addMark({ what: 'once' })),
})

export const startOnceTwice = action('startOnceTwice', {
  access: 'nobody',
  output: list(json()),
  run: async () => [start(once), start(once)],
})

export const callOnce = action('callOnce', {
  access: 'nobody',
  system: 'it waits for a flow that has full access',
  output: json(),
  run: async () => once(),
})

// A start that a step makes is paced as any other.
export const startsInStep = flow('startsInStep', {
  run: async ({ step }) => step('starts', () => [start(once), start(once)]),
})
