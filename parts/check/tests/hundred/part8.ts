import { action, change, fail, flow, input, link, number, query, table, text } from 'tentjs'

export const things8 = table('things8', {
  columns: { name: text(), size: number({ default: 0 }), note: text({ optional: true }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

export const count8 = query('count8', { access: 'signedIn', rows: things8.count() })

export const list8 = query('list8', {
  access: 'signedIn',
  input: { most: number({ default: 20, max: 100 }) },
  rows: things8.where({ size: { above: 0 } }).newest('size').limit(input('most')),
})

export const large8 = query('large8', {
  access: 'signedIn',
  input: { least: number() },
  output: number(),
  run: ({ input, db }) => {
    const found = db.things8.where({ size: { atLeast: input.least } }).limit(100).all()
    if (!found.length) return 0
    return found.length
  },
})

export const add8 = change('add8', {
  access: 'signedIn',
  input: { name: text(), size: number() },
  set: things8.add({ name: input('name'), size: input('size') }),
})

export const rename8 = change('rename8', {
  access: 'signedIn',
  input: { thing: link('things8'), name: text() },
  set: things8.change(input('thing'), { name: input('name') }),
})

export const grow8 = change('grow8', {
  access: 'signedIn',
  input: { thing: link('things8'), by: number() },
  run: ({ input, db }) => {
    const thing = db.things8.get(input.thing)
    if (!thing) fail('not-found', 'That thing is not there.')
    db.things8.change(input.thing, { size: thing.size + input.by })
  },
})

export const drop8 = change('drop8', {
  access: 'signedIn',
  input: { thing: link('things8') },
  run: ({ input, db }) => {
    if (count8() < 2) fail('last-one', 'The last thing stays.')
    db.things8.remove(input.thing)
  },
})

export const tidy8 = action('tidy8', {
  access: 'signedIn',
  input: { thing: link('things8') },
  run: async ({ input, db }) => {
    const thing = await db.things8.get(input.thing)
    if (thing && thing.size < 0) await drop8({ thing: input.thing })
  },
})

export const watch8 = flow('watch8', {
  on: things8.added(),
  run: async ({ event, step }) => {
    await step('grow', () => grow8({ thing: event.row.id, by: 1 }))
    await step.wait('1 day')
  },
})
