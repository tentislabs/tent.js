import type { Makers } from 'tentjs/engine'

// A provider of the project's own: a message that names a refund asks for the tool first, and every answer says
// what the person said, in two parts.
export default {
  providers: () => ({
    mine: {
      async *reply(o) {
        const last = o.messages.at(-1)
        const asked = o.messages.findLast((one) => one.who === 'user')?.text ?? ''
        if (last?.who === 'user' && asked.includes('refund')) {
          yield { end: { text: '', calls: [{ id: 'c1', tool: 'refund', input: { order: 'o1' } }] } }
          return
        }
        const said = last?.who === 'tool' ? String(last.result ?? last.error) : `You said ${asked}`
        yield { text: said.slice(0, 4) }
        yield { text: said.slice(4) }
        yield { end: { text: said, calls: [] } }
      },
    },
  }),
} satisfies Makers
