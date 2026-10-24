import { action, change, fail, flow, input, link, number, query, table, text } from 'tentjs'

export const things1 = table('things1', {
  columns: { name: text(), size: number({ default: 0 }), note: text({ optional: true }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

export const count1 = query('count1', { access: 'signedIn', rows: things1.count() })

export const list1 = query('list1', {
  access: 'signedIn',
  input: { most: number({ default: 20, max: 100 }) },
  rows: things1.where({ size: { above: 0 } }).newest('size').limit(input('most')),
})

export const large1 = query('large1', {
  access: 'signedIn',
  input: { least: number() },
  output: number(),
  run: ({ input, db }) => {
    const found = db.things1.where({ size: { atLeast: input.least } }).limit(100).all()
    if (!found.length) return 0
    return found.length
  },
})

export const add1 = change('add1', {
  access: 'signedIn',
  input: { name: text(), size: number() },
  set: things1.add({ name: input('name'), size: input('size') }),
})

export const rename1 = change('rename1', {
  access: 'signedIn',
  input: { thing: link('things1'), name: text() },
  set: things1.change(input('thing'), { name: input('name') }),
})

export const grow1 = change('grow1', {
  access: 'signedIn',
  input: { thing: link('things1'), by: number() },
  run: ({ input, db }) => {
    const thing = db.things1.get(input.thing)
    if (!thing) fail('not-found', 'That thing is not there.')
    db.things1.change(input.thing, { size: thing.size + input.by })
  },
})

export const drop1 = change('drop1', {
  access: 'signedIn',
  input: { thing: link('things1') },
  run: ({ input, db }) => {
    if (count1() < 2) fail('last-one', 'The last thing stays.')
    db.things1.remove(input.thing)
  },
})

export const tidy1 = action('tidy1', {
  access: 'signedIn',
  input: { thing: link('things1') },
  run: async ({ input, db }) => {
    const thing = await db.things1.get(input.thing)
    if (thing && thing.size < 0) await drop1({ thing: input.thing })
  },
})

export const watch1 = flow('watch1', {
  on: things1.added(),
  run: async ({ event, step }) => {
    await step('grow', () => grow1({ thing: event.row.id, by: 1 }))
    await step.wait('1 day')
  },
})
