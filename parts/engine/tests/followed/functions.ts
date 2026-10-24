import { action, agent, change, flow, input, json, list, model, number, role, runs, text } from 'tentjs'
import { users } from './tables.ts'

/** What holds a step back until the test lets it go, by name, kept on the program for the tests. */
async function gate(name: string): Promise<void> {
  const held: unknown = Reflect.get(globalThis, Symbol.for('tentjs.test.followed'))
  const waits: unknown = held instanceof Map ? held.get(name) : undefined
  if (waits instanceof Promise) await waits
}

/** Whether the test asked a step to fail once, which it then does no more. */
function failOnce(name: string): boolean {
  const held: unknown = Reflect.get(globalThis, Symbol.for('tentjs.test.followed.fail'))
  if (!(held instanceof Set) || !held.has(name)) return false
  held.delete(name)
  return true
}

export const backup = model('backup', { provider: 'mine', name: 'm-2', abilities: ['reply', 'tools', 'typedAnswers'] })
export const writer = model('writer', {
  provider: 'mine',
  name: 'm-1',
  abilities: ['reply', 'tools', 'typedAnswers'],
  takes: 100000,
  fallback: [backup],
})

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

// A tool that asks before it runs.
export const refund = action('refund', {
  about: 'Gives the money back',
  access: 'signedIn',
  input: { order: text() },
  output: text(),
  danger: 'ask',
  run: async ({ input: given }) => `refunded ${given.order}`,
})

const limits = { steps: 8, perRun: { calls: 100 } }

// An agent that is the tool of another, and asks for its own tool.
export const inner = agent('inner', {
  about: 'Refunds from inside',
  model: writer,
  instructions: 'You refund.',
  tools: [refund],
  access: 'signedIn',
  limits,
})

// An agent whose reasoning is shown as it comes, one that saves it, and one that does neither.
export const helper = agent('helper', {
  model: writer,
  instructions: 'You help.',
  tools: [inner],
  access: 'signedIn',
  reasoning: { show: true },
  limits,
})

export const keeper = agent('keeper', {
  model: writer,
  instructions: 'You keep notes.',
  tools: [],
  access: 'signedIn',
  reasoning: { save: true },
  limits,
})

export const quiet = agent('quiet', {
  model: writer,
  instructions: 'You say nothing of how you think.',
  tools: [],
  access: 'signedIn',
  limits,
})

// An agent that anyone may start, a visitor among them, whose tool is an agent whose tool says how far it
// has come: what a page on a reader follows.
export const openCount = flow('openCount', {
  about: 'Counts up to a number',
  as: 'starter',
  access: 'anyone',
  sends: false,
  input: { n: number() },
  output: number(),
  run: async ({ input: given, step }) =>
    step('count', async ({ say }) => {
      for (let at = 1; at <= given.n; at++) say({ at })
      await gate('open')
      return given.n
    }),
})

export const openInner = agent('openInner', {
  about: 'Answers from inside',
  model: writer,
  instructions: 'You answer from inside.',
  tools: [openCount],
  access: 'anyone',
  reasoning: { show: true },
  limits,
})

export const openHelper = agent('openHelper', {
  model: writer,
  instructions: 'You help openly.',
  tools: [openInner, openCount],
  access: 'anyone',
  limits,
})

// A flow that runs as the system and that its starter may follow, whose step calls an agent; and the same that nobody may follow.
export const sweep = flow('sweep', {
  access: 'signedIn',
  follow: 'signedIn',
  input: {},
  run: async ({ step }) => step('ask', () => inner({ message: 'Refund o1.' })),
})

export const sweepClosed = flow('sweepClosed', {
  access: 'signedIn',
  input: {},
  run: async ({ step }) => step('ask', () => inner({ message: 'Refund o1.' })),
})

// What waits under a run, which a function of the system finds.
export const waitingUnder = action('waitingUnder', {
  access: 'signedIn',
  system: 'finds what waits under a run of a flow of the system',
  input: { top: text() },
  output: json(),
  run: async ({ input: given }) => runs.find({ top: given.top, states: ['waiting'] }),
})

// A flow whose step says how far it has come, and whose starter may follow it.
export const counting = flow('counting', {
  as: 'starter',
  access: 'anyone',
  follow: 'signedIn',
  input: { n: number() },
  output: number(),
  run: async ({ input: given, step }) =>
    step(
      'count',
      async ({ say }) => {
        for (let at = 1; at <= given.n; at++) say({ at })
        await gate('count')
        if (failOnce('count')) throw new Error('This try fails once.')
        return given.n
      },
      { tries: { max: 2, wait: '1 second' } },
    ),
})

// A flow that the staff alone may follow.
export const forStaff = flow('forStaff', {
  as: 'starter',
  access: 'signedIn',
  follow: role('staff'),
  input: {},
  run: async ({ step }) => step('one', () => 1),
})

// Two passes of one step, which say apart.
export const twice = flow('twice', {
  as: 'starter',
  access: 'signedIn',
  follow: 'signedIn',
  input: {},
  run: async ({ step }) => {
    for (let pass = 1; pass <= 2; pass++)
      await step('pass', async ({ say }) => {
        say({ pass })
        await gate(`pass ${pass}`)
        return pass
      })
  },
})

// A step that says too much, and a flow that states no `follow`.
export const tooMuch = flow('tooMuch', {
  as: 'starter',
  access: 'signedIn',
  follow: 'signedIn',
  input: {},
  run: async ({ step }) => step('big', ({ say }) => say('x'.repeat(100_000)), { tries: 1 }),
})

export const unfollowed = flow('unfollowed', {
  as: 'starter',
  access: 'signedIn',
  input: {},
  output: number(),
  run: async ({ step }) => step('one', () => 1),
})

// A typed answer that grows, which its step says part by part.
export const shaped = flow('shaped', {
  as: 'starter',
  access: 'signedIn',
  follow: 'signedIn',
  input: {},
  output: list(text()),
  run: async ({ step }) =>
    step('list', async ({ say }) => {
      let last: unknown = []
      for await (const part of writer.stream('Name three.', { shape: list(text()) })) {
        say(part.value)
        last = part.value
      }
      return Array.isArray(last) ? last.map(String) : []
    }),
})

/// A flow that every caller may start and follow, each their own runs: a visitor by their visitor id. Its call
// waits for its run, whose answer is who started it.
export const visiting = flow('visiting', {
  as: 'starter',
  access: 'anyone',
  follow: 'anyone',
  input: { who: text() },
  run: async ({ input: given, step }) =>
    step('visit', async ({ say }) => {
      say({ who: given.who })
      return given.who
    }),
})

// An action that is a run, which its caller may follow by the id of the T0008 that ends the wait.
export const heavy = action('heavy', {
  access: 'signedIn',
  background: true,
  follow: 'signedIn',
  sends: false,
  // Its caller waits a second, and its one try may take a minute.
  limits: { time: '1 second', try: '1 minute' },
  input: {},
  output: text(),
  run: async ({ say }) => {
    say('at work')
    await gate('heavy')
    return 'heavy done'
  },
})
