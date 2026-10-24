import type { Makers } from 'tentjs/engine'

// A driver of the builder's own: it makes one step that calls a tool through the `env` it was made from, and
// answers what the tool answered with the name of the model the agent states.
export default {
  drivers: () => ({
    mine: (env) => async (run) => {
      const rows = await run.step('look', () => env.call('lookUp', [{ word: 'tent' }]))
      const record = Object(run.record)
      const model = String(Object(record.agent).model)
      return { text: `mine: ${JSON.stringify(rows)} by ${env.description(run.version).models[model]?.name}` }
    },
  }),
} satisfies Makers
