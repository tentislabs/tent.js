import type { Makers } from 'tentjs/engine'

// A provider of this computer, which a case of the declarations never reaches: every model is stood in for there.
export default {
  providers: () => ({
    mine: {
      async *reply() {
        yield { end: { text: 'OK', calls: [] } }
      },
      async call() {
        return { output: 'a picture' }
      },
    },
  }),
} satisfies Makers
