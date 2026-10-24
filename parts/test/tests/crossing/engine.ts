import type { Makers } from 'tentjs/engine'

Reflect.set(globalThis, 'crossingLoaded', [...(Reflect.get(globalThis, 'crossingLoaded') ?? []), import.meta.url])

// A mailer of the project's own: what it sends is kept in its own heap, and counted.
const sent: object[] = []

export default {
  mailer: () => ({
    send: async (message: object) => {
      sent.push(message)
      return { id: `sent ${sent.length}` }
    },
  }),
} satisfies Makers
