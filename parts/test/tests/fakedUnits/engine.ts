import type { Makers } from 'tentjs/engine'

// The provider of the model that is a function, which the test fakes: it is never called.
export default {
  providers: () => ({
    decisions: {
      async call() {
        throw new Error('the provider of the decisions is faked in every test')
      },
    },
  }),
} satisfies Makers
