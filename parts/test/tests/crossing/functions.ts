import { action, allow, change, flow, mail, number, query, route, text } from 'tentjs'

Reflect.set(globalThis, 'crossingLoaded', [...(Reflect.get(globalThis, 'crossingLoaded') ?? []), import.meta.url])

// A helper of the module's own: what calls it is code, which the build cannot read as words.
const same = <Value>(value: Value): Value => [value][0] ?? value

export const counted = query('counted', {
  access: allow((user) => same(user?.id) !== 'refused'),
  output: number(),
  offer: ['api'],
  run: ({ db }) => same(db.notes.count()),
})

export const added = change('added', {
  access: 'anyone',
  input: { what: text() },
  output: text(),
  run: ({ db, input }) => same(db.notes.add({ what: input.what, to: 'anyone' }).id),
})

// An action that sends a mail, by the mailer that `engine.ts` makes, and calls a change.
export const mailed = action('mailed', {
  access: 'anyone',
  input: { to: text() },
  output: text(),
  run: async ({ input }) => {
    await mail.send({ to: same(input.to), from: 'app@example.com', subject: 'A note', text: 'hello' })
    return added({ what: `mailed ${input.to}` })
  },
})

export const batched = action('batched', {
  access: 'anyone',
  input: { n: number() },
  output: number(),
  batch: { max: 4, wait: '1 second' },
  run: async ({ entries }) => entries.map((one) => same(one.input.n) * 2),
})

export const echo = route('echo', {
  method: 'GET',
  path: '/echo',
  access: 'anyone',
  run: async ({ user }) => new Response(`echo ${same(user?.id) ?? 'nobody'}`),
})

// A flow whose run does two steps side by side and then fails, so its own `onFail` is carried out.
export const failing = flow('failing', {
  run: async ({ step }) => {
    const both = await step.all('both', [async () => same(1), async () => same(2)])
    if (both.length === 2) throw new Error('the flow fails on purpose')
    return both
  },
  onFail: async () => {
    await added({ what: same('the onFail ran') })
  },
})
