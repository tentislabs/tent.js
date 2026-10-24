import type { Makers } from 'tentjs/engine'

// A provider of the builder's own for three models that are no language models: one that decides whether a text
// may pass, one that scores an answer, and one that sorts a message. Each says what it used.
export default {
  providers: () => ({
    decisions: {
      async call(o) {
        const input = Object(o.input)
        const model = String(Reflect.get(o.model, 'name'))
        if (model === 'gate-1') {
          const text = String(input.answer ?? '')
          return {
            output: text.includes('forbidden') ? { score: 0, why: 'the gate said no' } : { score: 1, why: 'it may pass' },
            units: { decisions: 1 },
          }
        }
        if (model === 'score-1')
          return { output: { score: String(input.answer).includes('kind') ? 0.9 : 0.2, why: 'scored' }, units: { decisions: 1 } }
        return { output: { kind: String(input.message).includes('refund') ? 'refund' : 'question' }, units: { decisions: 1 } }
      },
    },
  }),
} satisfies Makers
