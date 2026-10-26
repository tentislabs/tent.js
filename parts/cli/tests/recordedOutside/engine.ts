import type { Makers } from 'tentjs/engine'

// A provider of this computer: a model of it is no model of an outside server, and still none that a test faked.
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
