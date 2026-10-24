import { action, file, files, list, number, table, text } from 'tentjs'
import { wordOf } from '../helpers/words.ts'
import { BroadcastChannel } from 'node:worker_threads'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

/**
 * Tells the test that the work of a definition was carried out, over a channel that every thread of the program
 * shares, so that the test hears it in whatever room the code runs. Answers how often it was, as the test counts.
 */
function counted(name: string): Promise<number> {
  const channel = new BroadcastChannel('tentjs.test.remembers')
  // A count that nobody answers any more, of an app that was closed, holds the program up no longer.
  channel.unref()
  const id = `${name} ${Math.random()}`
  return new Promise((done) => {
    channel.onmessage = (event: unknown) => {
      const answer = Object(Reflect.get(Object(event), 'data'))
      if (answer.id !== id || 'told' in answer) return
      channel.close()
      done(Number(answer.value))
    }
    channel.postMessage({ id, told: name })
  })
}

export const worded = action('worded', {
  access: 'signedIn',
  remember: true,
  input: { n: number() },
  output: text(),
  run: async ({ input }) => {
    await counted('worded')
    return wordOf(input.n)
  },
})

export const versioned = action('versioned', {
  access: 'signedIn',
  remember: { version: '1' },
  input: { n: number() },
  output: text(),
  run: async ({ input }) => {
    await counted('versioned')
    return wordOf(input.n)
  },
})

export const kinded = action('kinded', {
  access: 'signedIn',
  worker: 'gpu',
  sends: false,
  remember: { version: '1', kind: true },
  input: { n: number() },
  output: number(),
  run: async ({ input }) => {
    await counted('kinded')
    return input.n
  },
})

export const failsOnce = action('failsOnce', {
  access: 'signedIn',
  remember: true,
  input: { n: number() },
  output: number(),
  run: async ({ input }) => {
    if ((await counted('failsOnce')) === 1) throw new Error('the first try fails')
    return input.n
  },
})

export const brief = action('brief', {
  access: 'signedIn',
  remember: { for: '1 hour' },
  input: { n: number() },
  output: number(),
  run: async ({ input }) => {
    await counted('brief')
    return input.n
  },
})

export const long = action('long', {
  access: 'signedIn',
  remember: true,
  input: { n: number() },
  output: text(),
  run: async ({ input }) => {
    await counted(`long ${input.n}`)
    return 'x'.repeat(80)
  },
})

export const made = action('made', {
  access: 'signedIn',
  remember: { shared: 'the bytes are the same for everyone' },
  uses: [files.put],
  input: { n: number() },
  output: file(),
  run: async ({ input }) => {
    await counted('made')
    return files.put(`the bytes of ${input.n}`, { name: 'made.txt' })
  },
})

export const textOf = action('textOf', {
  access: 'signedIn',
  uses: [files.text],
  input: { id: text() },
  output: text(),
  run: async ({ input }) => files.text(input.id),
})
