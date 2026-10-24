import type { Makers } from 'tentjs/engine'
import { BroadcastChannel } from 'node:worker_threads'

/**
 * Tells the test of each `embed` with its model and how many texts, over a channel that every thread of the program
 * shares, so that the test hears it in whatever room the code runs, and waits until the test has heard it.
 */
function told(embed: { model: string; texts: number }): Promise<void> {
  const channel = new BroadcastChannel('tentjs.test.vectors')
  // An embed that nobody hears any more, of an app that was closed, holds the program up no longer.
  channel.unref()
  const id = `${embed.model} ${Math.random()}`
  return new Promise((done) => {
    channel.onmessage = (event: unknown) => {
      const answer = Object(Reflect.get(Object(event), 'data'))
      if (answer.id !== id || 'told' in answer) return
      channel.close()
      done()
    }
    channel.postMessage({ id, told: embed })
  })
}

// A provider of the project's own: the model `a-1` turns every text into one vector and `b-1` into another, so
// that a test sees which model made a vector; every answer of `reply` is a few words.
export default {
  providers: () => ({
    mine: {
      async embed(o) {
        const name = String(o.model.name)
        await told({ model: name, texts: o.texts.length })
        const vector = name === 'a-1' ? [1, 0, 0] : [0, 1, 0]
        return { vectors: o.texts.map(() => vector), units: { tokensIn: o.texts.length } }
      },
      async *reply() {
        yield { text: 'Hello.' }
        yield { end: { text: 'Hello.', calls: [], units: { tokensIn: 4, tokensOut: 2 } } }
      },
    },
  }),
} satisfies Makers
