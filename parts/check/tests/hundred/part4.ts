import { action, change, fail, flow, input, link, number, query, table, text } from 'tentjs'

export const things4 = table('things4', {
  columns: { name: text(), size: number({ default: 0 }), note: text({ optional: true }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

export const count4 = query('count4', { access: 'signedIn', rows: things4.count() })

export const list4 = query('list4', {
  access: 'signedIn',
  input: { most: number({ default: 20, max: 100 }) },
  rows: things4.where({ size: { above: 0 } }).newest('size').limit(input('most')),
})

export const large4 = query('large4', {
  access: 'signedIn',
  input: { least: number() },
  output: number(),
  run: ({ input, db }) => {
    const found = db.things4.where({ size: { atLeast: input.least } }).limit(100).all()
    if (!found.length) return 0
    return found.length
  },
})

export const add4 = change('add4', {
  access: 'signedIn',
  input: { name: text(), size: number() },
  set: things4.add({ name: input('name'), size: input('size') }),
})

export const rename4 = change('rename4', {
  access: 'signedIn',
  input: { thing: link('things4'), name: text() },
  set: things4.change(input('thing'), { name: input('name') }),
})

export const grow4 = change('grow4', {
  access: 'signedIn',
  input: { thing: link('things4'), by: number() },
  run: ({ input, db }) => {
    const thing = db.things4.get(input.thing)
    if (!thing) fail('not-found', 'That thing is not there.')
    db.things4.change(input.thing, { size: thing.size + input.by })
  },
})

export const drop4 = change('drop4', {
  access: 'signedIn',
  input: { thing: link('things4') },
  run: ({ input, db }) => {
    if (count4() < 2) fail('last-one', 'The last thing stays.')
    db.things4.remove(input.thing)
  },
})

export const tidy4 = action('tidy4', {
  access: 'signedIn',
  input: { thing: link('things4') },
  run: async ({ input, db }) => {
    const thing = await db.things4.get(input.thing)
    if (thing && thing.size < 0) await drop4({ thing: input.thing })
  },
})

export const watch4 = flow('watch4', {
  on: things4.added(),
  run: async ({ event, step }) => {
    await step('grow', () => grow4({ thing: event.row.id, by: 1 }))
    await step.wait('1 day')
  },
})
