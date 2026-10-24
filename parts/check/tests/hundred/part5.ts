import { action, change, fail, flow, input, link, number, query, table, text } from 'tentjs'

export const things5 = table('things5', {
  columns: { name: text(), size: number({ default: 0 }), note: text({ optional: true }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

export const count5 = query('count5', { access: 'signedIn', rows: things5.count() })

export const list5 = query('list5', {
  access: 'signedIn',
  input: { most: number({ default: 20, max: 100 }) },
  rows: things5.where({ size: { above: 0 } }).newest('size').limit(input('most')),
})

export const large5 = query('large5', {
  access: 'signedIn',
  input: { least: number() },
  output: number(),
  run: ({ input, db }) => {
    const found = db.things5.where({ size: { atLeast: input.least } }).limit(100).all()
    if (!found.length) return 0
    return found.length
  },
})

export const add5 = change('add5', {
  access: 'signedIn',
  input: { name: text(), size: number() },
  set: things5.add({ name: input('name'), size: input('size') }),
})

export const rename5 = change('rename5', {
  access: 'signedIn',
  input: { thing: link('things5'), name: text() },
  set: things5.change(input('thing'), { name: input('name') }),
})

export const grow5 = change('grow5', {
  access: 'signedIn',
  input: { thing: link('things5'), by: number() },
  run: ({ input, db }) => {
    const thing = db.things5.get(input.thing)
    if (!thing) fail('not-found', 'That thing is not there.')
    db.things5.change(input.thing, { size: thing.size + input.by })
  },
})

export const drop5 = change('drop5', {
  access: 'signedIn',
  input: { thing: link('things5') },
  run: ({ input, db }) => {
    if (count5() < 2) fail('last-one', 'The last thing stays.')
    db.things5.remove(input.thing)
  },
})

export const tidy5 = action('tidy5', {
  access: 'signedIn',
  input: { thing: link('things5') },
  run: async ({ input, db }) => {
    const thing = await db.things5.get(input.thing)
    if (thing && thing.size < 0) await drop5({ thing: input.thing })
  },
})

export const watch5 = flow('watch5', {
  on: things5.added(),
  run: async ({ event, step }) => {
    await step('grow', () => grow5({ thing: event.row.id, by: 1 }))
    await step.wait('1 day')
  },
})
