import { action, change, fail, flow, input, link, number, query, table, text } from 'tentjs'

export const things9 = table('things9', {
  columns: { name: text(), size: number({ default: 0 }), note: text({ optional: true }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

export const count9 = query('count9', { access: 'signedIn', rows: things9.count() })

export const list9 = query('list9', {
  access: 'signedIn',
  input: { most: number({ default: 20, max: 100 }) },
  rows: things9.where({ size: { above: 0 } }).newest('size').limit(input('most')),
})

export const large9 = query('large9', {
  access: 'signedIn',
  input: { least: number() },
  output: number(),
  run: ({ input, db }) => {
    const found = db.things9.where({ size: { atLeast: input.least } }).limit(100).all()
    if (!found.length) return 0
    return found.length
  },
})

export const add9 = change('add9', {
  access: 'signedIn',
  input: { name: text(), size: number() },
  set: things9.add({ name: input('name'), size: input('size') }),
})

export const rename9 = change('rename9', {
  access: 'signedIn',
  input: { thing: link('things9'), name: text() },
  set: things9.change(input('thing'), { name: input('name') }),
})

export const grow9 = change('grow9', {
  access: 'signedIn',
  input: { thing: link('things9'), by: number() },
  run: ({ input, db }) => {
    const thing = db.things9.get(input.thing)
    if (!thing) fail('not-found', 'That thing is not there.')
    db.things9.change(input.thing, { size: thing.size + input.by })
  },
})

export const drop9 = change('drop9', {
  access: 'signedIn',
  input: { thing: link('things9') },
  run: ({ input, db }) => {
    if (count9() < 2) fail('last-one', 'The last thing stays.')
    db.things9.remove(input.thing)
  },
})

export const tidy9 = action('tidy9', {
  access: 'signedIn',
  input: { thing: link('things9') },
  run: async ({ input, db }) => {
    const thing = await db.things9.get(input.thing)
    if (thing && thing.size < 0) await drop9({ thing: input.thing })
  },
})

export const watch9 = flow('watch9', {
  on: things9.added(),
  run: async ({ event, step }) => {
    await step('grow', () => grow9({ thing: event.row.id, by: 1 }))
    await step.wait('1 day')
  },
})
