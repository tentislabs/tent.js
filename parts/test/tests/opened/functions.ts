import { action, change, input, list, query, table, text } from 'tentjs'
import { BroadcastChannel } from 'node:worker_threads'

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const orders = table('orders', {
  columns: { title: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const openOrders = query('openOrders', { access: 'signedIn', rows: orders.oldest('title') })

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { title: text() },
  set: orders.add({ title: input('title') }),
})

/**
 * Tells the test that the call arrived, over a channel that every thread of the program shares, so that the test
 * hears it in whatever room the code runs, and waits until the test lets it go.
 */
function gate(): Promise<void> {
  const channel = new BroadcastChannel('tentjs.test.landing')
  // A call that nobody lets go any more, of an app that was closed, holds the program up no longer.
  channel.unref()
  const id = `addLater ${Math.random()}`
  return new Promise((done) => {
    channel.onmessage = (event: unknown) => {
      const answer = Object(Reflect.get(Object(event), 'data'))
      if (answer.id !== id || 'told' in answer) return
      channel.close()
      done()
    }
    channel.postMessage({ id, told: 'addLater' })
  })
}

export const addLater = action('addLater', {
  access: 'signedIn',
  input: { title: text() },
  run: async ({ input: given }) => {
    await gate()
    await addOrder({ title: given.title })
  },
})

// An action that never answers: the engine ends it after the time of an action.
export const never = action('never', {
  access: 'signedIn',
  run: () => new Promise(() => undefined),
})
