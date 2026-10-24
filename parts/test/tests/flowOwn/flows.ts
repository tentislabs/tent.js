import { flow, text } from 'tentjs'

const shout = (name: string): string => name.toUpperCase()

// A flow that states `plain: true` and whose `run` calls a function of the file's own: it is refused.
export const loud = flow('loud', {
  plain: true,
  input: { name: text() },
  run: async ({ input, step }) => {
    const said = await step('shout', () => shout(input.name))
    return said
  },
})
