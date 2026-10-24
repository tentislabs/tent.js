import { action, change, fail, flow, input, link, number, query, table, text } from 'tentjs'

export const things3 = table('things3', {
  columns: { name: text(), size: number({ default: 0 }), note: text({ optional: true }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

export const count3 = query('count3', { access: 'signedIn', rows: things3.count() })

export const list3 = query('list3', {
  access: 'signedIn',
  input: { most: number({ default: 20, max: 100 }) },
  rows: things3.where({ size: { above: 0 } }).newest('size').limit(input('most')),
})

export const large3 = query('large3', {
  access: 'signedIn',
  input: { least: number() },
  output: number(),
  run: ({ input, db }) => {
    const found = db.things3.where({ size: { atLeast: input.least } }).limit(100).all()
    if (!found.length) return 0
    return found.length
  },
})

export const add3 = change('add3', {
  access: 'signedIn',
  input: { name: text(), size: number() },
  set: things3.add({ name: input('name'), size: input('size') }),
})

export const rename3 = change('rename3', {
  access: 'signedIn',
  input: { thing: link('things3'), name: text() },
  set: things3.change(input('thing'), { name: input('name') }),
})

export const grow3 = change('grow3', {
  access: 'signedIn',
  input: { thing: link('things3'), by: number() },
  run: ({ input, db }) => {
    const thing = db.things3.get(input.thing)
    if (!thing) fail('not-found', 'That thing is not there.')
    db.things3.change(input.thing, { size: thing.size + input.by })
  },
})

export const drop3 = change('drop3', {
  access: 'signedIn',
  input: { thing: link('things3') },
  run: ({ input, db }) => {
    if (count3() < 2) fail('last-one', 'The last thing stays.')
    db.things3.remove(input.thing)
  },
})

export const tidy3 = action('tidy3', {
  access: 'signedIn',
  input: { thing: link('things3') },
  run: async ({ input, db }) => {
    const thing = await db.things3.get(input.thing)
    if (thing && thing.size < 0) await drop3({ thing: input.thing })
  },
})

export const watch3 = flow('watch3', {
  on: things3.added(),
  run: async ({ event, step }) => {
    await step('grow', () => grow3({ thing: event.row.id, by: 1 }))
    await step.wait('1 day')
  },
})
