import type { Makers } from 'tentjs/engine'

// The sign-in of the builder's own: it writes the once-only key that the request carries into a line of its own.
export default {
  signers: () => ({
    signed: (request: Request) => {
      const made = new Request(request)
      made.headers.set('X-Signed', `by the signer, key ${request.headers.get('idempotency-key') ?? 'none'}`)
      return made
    },
  }),
} satisfies Makers
