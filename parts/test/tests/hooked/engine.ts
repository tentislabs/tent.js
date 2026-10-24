import type { Makers } from 'tentjs/engine'

// A check of the builder's own: the partner sends its secret in a line, and the id of its call in another.
export default {
  verifiers: () => ({
    partner: ({ headers, secret }) => {
      if (headers.get('x-partner-key') !== secret) throw new Error('The call is not from the partner.')
      return { id: headers.get('x-partner-id') ?? undefined }
    },
  }),
} satisfies Makers
