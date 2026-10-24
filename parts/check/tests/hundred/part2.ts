import { action, change, fail, flow, input, link, number, query, table, text } from 'tentjs'

export const things2 = table('things2', {
  columns: { name: text(), size: number({ default: 0 }), note: text({ optional: true }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

export const count2 = query('count2', { access: 'signedIn', rows: things2.count() })

export const list2 = query('list2', {
  access: 'signedIn',
  input: { most: number({ default: 20, max: 100 }) },
  rows: things2.where({ size: { above: 0 } }).newest('size').limit(input('most')),
})

export const large2 = query('large2', {
  access: 'signedIn',
  input: { least: number() },
  output: number(),
  run: ({ input, db }) => {
    const found = db.things2.where({ size: { atLeast: input.least } }).limit(100).all()
    if (!found.length) return 0
    return found.length
  },
})

export const add2 = change('add2', {
  access: 'signedIn',
  input: { name: text(), size: number() },
  set: things2.add({ name: input('name'), size: input('size') }),
})

export const rename2 = change('rename2', {
  access: 'signedIn',
  input: { thing: link('things2'), name: text() },
  set: things2.change(input('thing'), { name: input('name') }),
})

export const grow2 = change('grow2', {
  access: 'signedIn',
  input: { thing: link('things2'), by: number() },
  run: ({ input, db }) => {
    const thing = db.things2.get(input.thing)
    if (!thing) fail('not-found', 'That thing is not there.')
    db.things2.change(input.thing, { size: thing.size + input.by })
  },
})

export const drop2 = change('drop2', {
  access: 'signedIn',
  input: { thing: link('things2') },
  run: ({ input, db }) => {
    if (count2() < 2) fail('last-one', 'The last thing stays.')
    db.things2.remove(input.thing)
  },
})

export const tidy2 = action('tidy2', {
  access: 'signedIn',
  input: { thing: link('things2') },
  run: async ({ input, db }) => {
    const thing = await db.things2.get(input.thing)
    if (thing && thing.size < 0) await drop2({ thing: input.thing })
  },
})

export const watch2 = flow('watch2', {
  on: things2.added(),
  run: async ({ event, step }) => {
    await step('grow', () => grow2({ thing: event.row.id, by: 1 }))
    await step.wait('1 day')
  },
})
