import { action, change, fail, flow, input, link, number, query, table, text } from 'tentjs'

export const things7 = table('things7', {
  columns: { name: text(), size: number({ default: 0 }), note: text({ optional: true }) },
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
})

export const count7 = query('count7', { access: 'signedIn', rows: things7.count() })

export const list7 = query('list7', {
  access: 'signedIn',
  input: { most: number({ default: 20, max: 100 }) },
  rows: things7.where({ size: { above: 0 } }).newest('size').limit(input('most')),
})

export const large7 = query('large7', {
  access: 'signedIn',
  input: { least: number() },
  output: number(),
  run: ({ input, db }) => {
    const found = db.things7.where({ size: { atLeast: input.least } }).limit(100).all()
    if (!found.length) return 0
    return found.length
  },
})

export const add7 = change('add7', {
  access: 'signedIn',
  input: { name: text(), size: number() },
  set: things7.add({ name: input('name'), size: input('size') }),
})

export const rename7 = change('rename7', {
  access: 'signedIn',
  input: { thing: link('things7'), name: text() },
  set: things7.change(input('thing'), { name: input('name') }),
})

export const grow7 = change('grow7', {
  access: 'signedIn',
  input: { thing: link('things7'), by: number() },
  run: ({ input, db }) => {
    const thing = db.things7.get(input.thing)
    if (!thing) fail('not-found', 'That thing is not there.')
    db.things7.change(input.thing, { size: thing.size + input.by })
  },
})

export const drop7 = change('drop7', {
  access: 'signedIn',
  input: { thing: link('things7') },
  run: ({ input, db }) => {
    if (count7() < 2) fail('last-one', 'The last thing stays.')
    db.things7.remove(input.thing)
  },
})

export const tidy7 = action('tidy7', {
  access: 'signedIn',
  input: { thing: link('things7') },
  run: async ({ input, db }) => {
    const thing = await db.things7.get(input.thing)
    if (thing && thing.size < 0) await drop7({ thing: input.thing })
  },
})

export const watch7 = flow('watch7', {
  on: things7.added(),
  run: async ({ event, step }) => {
    await step('grow', () => grow7({ thing: event.row.id, by: 1 }))
    await step.wait('1 day')
  },
})
