import type { Makers } from 'tentjs/engine'

// A provider that writes, with reasoning, and a typed answer where one is asked for; and one whose server is down,
// whose error counts as an error of its server.
export default {
  providers: () => ({
    mine: {
      async *reply(o) {
        yield { reasoning: 'Thinking it over.' }
        const text = o.shape ? JSON.stringify({ ok: true }) : 'OK'
        yield { text }
        yield { end: { text, calls: [] } }
      },
      async call() {
        return { output: 'a picture' }
      },
    },
    down: {
      async *reply() {
        const failure = new Error('The server is down.')
        if (failure.message) throw failure
        yield { text: 'never' }
      },
    },
  }),
} satisfies Makers
