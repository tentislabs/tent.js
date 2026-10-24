import { action, text } from 'tentjs'

/** Where a test holds the work back, and what the work was handed: kept on the program. */
function held(): { gate?: Promise<void>; calls: string[] } {
  const key = Symbol.for('tentjs.test.engineFilling')
  const found: unknown = Reflect.get(globalThis, key)
  if (found && typeof found === 'object' && 'calls' in found) return Object(found)
  const made = { calls: [] }
  Reflect.set(globalThis, key, made)
  return made
}

export const summarize = action('summarize', {
  access: 'nobody',
  system: 'fills the summary of an order from its own columns',
  input: { title: text(), note: text() },
  output: text(),
  run: async ({ input }) => {
    const now = held()
    now.calls.push(input.title)
    if (now.gate) await now.gate
    return `${input.title}: ${input.note}`
  },
})
