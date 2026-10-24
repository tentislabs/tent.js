import type { Makers } from 'tentjs/engine'

// A provider of the project's own, which says what the person said, in two parts.
export default {
  providers: () => ({
    mine: {
      async *reply(o) {
        const said = `You said ${o.messages.at(-1)?.text ?? ''}`
        yield { text: said.slice(0, 4) }
        yield { text: said.slice(4) }
        yield { end: { text: said, calls: [] } }
      },
    },
  }),
} satisfies Makers
