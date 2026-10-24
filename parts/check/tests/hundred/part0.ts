import { action, change, fail, flow, input, link, number, query, table, text } from 'tentjs'

export const things0 = table('things0', {
  columns: { name: text(), size: number({ default: 0 }), note: text({ optional: true }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

export const count0 = query('count0', { access: 'signedIn', rows: things0.count() })

export const list0 = query('list0', {
  access: 'signedIn',
  input: { most: number({ default: 20, max: 100 }) },
  rows: things0.where({ size: { above: 0 } }).newest('size').limit(input('most')),
})

export const large0 = query('large0', {
  access: 'signedIn',
  input: { least: number() },
  output: number(),
  run: ({ input, db }) => {
    const found = db.things0.where({ size: { atLeast: input.least } }).limit(100).all()
    if (!found.length) return 0
    return found.length
  },
})

export const add0 = change('add0', {
  access: 'signedIn',
  input: { name: text(), size: number() },
  set: things0.add({ name: input('name'), size: input('size') }),
})

export const rename0 = change('rename0', {
  access: 'signedIn',
  input: { thing: link('things0'), name: text() },
  set: things0.change(input('thing'), { name: input('name') }),
})

export const grow0 = change('grow0', {
  access: 'signedIn',
  input: { thing: link('things0'), by: number() },
  run: ({ input, db }) => {
    const thing = db.things0.get(input.thing)
    if (!thing) fail('not-found', 'That thing is not there.')
    db.things0.change(input.thing, { size: thing.size + input.by })
  },
})

export const drop0 = change('drop0', {
  access: 'signedIn',
  input: { thing: link('things0') },
  run: ({ input, db }) => {
    if (count0() < 2) fail('last-one', 'The last thing stays.')
    db.things0.remove(input.thing)
  },
})

export const tidy0 = action('tidy0', {
  access: 'signedIn',
  input: { thing: link('things0') },
  run: async ({ input, db }) => {
    const thing = await db.things0.get(input.thing)
    if (thing && thing.size < 0) await drop0({ thing: input.thing })
  },
})

export const watch0 = flow('watch0', {
  on: things0.added(),
  run: async ({ event, step }) => {
    await step('grow', () => grow0({ thing: event.row.id, by: 1 }))
    await step.wait('1 day')
  },
})
