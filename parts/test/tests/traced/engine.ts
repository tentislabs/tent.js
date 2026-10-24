import type { Makers } from 'tentjs/engine'

// The project's own provider: every answer is a note, and says what it used.
export default {
  providers: () => ({
    mine: {
      async *reply() {
        yield { text: 'A note' }
        yield { end: { text: 'A note', calls: [], units: { tokensIn: 12, tokensOut: 3 } } }
      },
    },
  }),
} satisfies Makers
