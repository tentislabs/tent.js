import { isStored } from '../../../core/internal.ts'

/** What the frame speaks to the chat app through: requests that are answered, notes, and the notes it is sent. */
export interface Bridge {
  request(method: string, params: object): Promise<unknown>
  notify(method: string, params: object): void
  heard(method: string, take: (params: Record<string, unknown>) => void): void
}

// How long a request waits for the chat app's answer: a call of a tool waits as long as its own time, and a chat
// app that drops a request leaves no press busy for good.
const answerTime = 120_000

/**
 * Speaks to the chat app that shows the frame, over the messages between the two windows, as the standard's
 * extension writes them: each request has a number, and its answer comes back under it, or it fails once its time
 * is up.
 */
export function bridgeTo(chat: Window, time = answerTime): Bridge {
  let ids = 0
  const waiting = new Map<number, { done(value: unknown): void; failed(error: unknown): void; ended(): void }>()
  const notes = new Map<string, (params: Record<string, unknown>) => void>()
  window.addEventListener('message', (event) => {
    // Only the window that holds the frame speaks for the chat app.
    if (event.source !== chat) return
    const message: unknown = event.data
    if (!isStored(message) || message.jsonrpc !== '2.0') return
    if (typeof message.id === 'number' && typeof message.method !== 'string') {
      const one = waiting.get(message.id)
      waiting.delete(message.id)
      if (!one) return
      one.ended()
      if (isStored(message.error)) one.failed(message.error)
      else one.done(message.result)
      return
    }
    if (typeof message.method === 'string') notes.get(message.method)?.(isStored(message.params) ? message.params : {})
  })
  return {
    request: (method, params) =>
      new Promise((done, failed) => {
        ids += 1
        const id = ids
        const timer = setTimeout(() => {
          waiting.delete(id)
          failed(new Error(`The chat app did not answer ${method} in time.`))
        }, time)
        waiting.set(id, { done, failed, ended: () => clearTimeout(timer) })
        chat.postMessage({ jsonrpc: '2.0', id, method, params }, '*')
      }),
    notify: (method, params) => chat.postMessage({ jsonrpc: '2.0', method, params }, '*'),
    heard: (method, take) => {
      notes.set(method, take)
    },
  }
}
