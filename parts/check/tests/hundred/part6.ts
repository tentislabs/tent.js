import { action, change, fail, flow, input, link, number, query, table, text } from 'tentjs'

export const things6 = table('things6', {
  columns: { name: text(), size: number({ default: 0 }), note: text({ optional: true }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

export const count6 = query('count6', { access: 'signedIn', rows: things6.count() })

export const list6 = query('list6', {
  access: 'signedIn',
  input: { most: number({ default: 20, max: 100 }) },
  rows: things6.where({ size: { above: 0 } }).newest('size').limit(input('most')),
})

export const large6 = query('large6', {
  access: 'signedIn',
  input: { least: number() },
  output: number(),
  run: ({ input, db }) => {
    const found = db.things6.where({ size: { atLeast: input.least } }).limit(100).all()
    if (!found.length) return 0
    return found.length
  },
})

export const add6 = change('add6', {
  access: 'signedIn',
  input: { name: text(), size: number() },
  set: things6.add({ name: input('name'), size: input('size') }),
})

export const rename6 = change('rename6', {
  access: 'signedIn',
  input: { thing: link('things6'), name: text() },
  set: things6.change(input('thing'), { name: input('name') }),
})

export const grow6 = change('grow6', {
  access: 'signedIn',
  input: { thing: link('things6'), by: number() },
  run: ({ input, db }) => {
    const thing = db.things6.get(input.thing)
    if (!thing) fail('not-found', 'That thing is not there.')
    db.things6.change(input.thing, { size: thing.size + input.by })
  },
})

export const drop6 = change('drop6', {
  access: 'signedIn',
  input: { thing: link('things6') },
  run: ({ input, db }) => {
    if (count6() < 2) fail('last-one', 'The last thing stays.')
    db.things6.remove(input.thing)
  },
})

export const tidy6 = action('tidy6', {
  access: 'signedIn',
  input: { thing: link('things6') },
  run: async ({ input, db }) => {
    const thing = await db.things6.get(input.thing)
    if (thing && thing.size < 0) await drop6({ thing: input.thing })
  },
})

export const watch6 = flow('watch6', {
  on: things6.added(),
  run: async ({ event, step }) => {
    await step('grow', () => grow6({ thing: event.row.id, by: 1 }))
    await step.wait('1 day')
  },
})
