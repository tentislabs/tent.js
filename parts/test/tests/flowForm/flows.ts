import { anyone, flow, number, object, text } from 'tentjs'

// A flow that the pages of the app may call: it runs as whoever called it, and answers through its `output`.
export const welcome = flow('welcome', {
  access: anyone('a visitor may be welcomed'),
  as: 'starter',
  input: { name: text({ min: 2 }), guests: number({ min: 0, default: 0 }) },
  output: object({ greeting: text() }),
  run: async ({ input, step }) => {
    const greeting = await step('greet', () => `Welcome ${input.name}, with ${input.guests} guests`)
    return { greeting, kept: 'what the output does not name stays in the engine' }
  },
})
