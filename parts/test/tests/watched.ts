import type { TestApp } from '../index.ts'
import { until } from './many.ts'

/** One message of the live connection, as it was read from JSON. */
export type Message = Record<string, unknown>

/** The end of a live connection of one machine that a test holds, as a page would. */
export interface Watcher {
  got: Message[]
  closed(): boolean
  close(): void
  // The messages of one name that it was sent so far, of one watch where an id is named.
  of(t: string, id?: string): Message[]
  // Sends a watch, and answers the first message that names it.
  watch(id: string, query: string, more?: Message): Promise<Message>
  // Sends a watch, and waits for no answer.
  ask(id: string, query: string, more?: Message): void
}

const origin = 'https://many.test'

/**
 * Opens a live connection of a machine with no network, as a page of the app opens it, and answers the end that
 * the page would hold. Each sign of life is answered, so that a test which takes its time is no page that went
 * silent.
 */
export function watcher(app: TestApp): Watcher {
  const end = app.live(new Request(`${origin}/_t/live`, { headers: { origin } }))
  const got: Message[] = []
  let closed = false
  end.each(
    (message) => {
      if (message.t === 'alive') end.send({ t: 'alive' })
      else got.push(message)
    },
    () => {
      closed = true
    },
  )
  const ask = (id: string, query: string, more: Message = {}): void =>
    end.send({ t: 'watch', id, query, input: {}, ...more })
  return {
    got,
    closed: () => closed,
    close: () => end.close(),
    of: (t, id) => got.filter((one) => one.t === t && (id === undefined || one.id === id)),
    ask,
    async watch(id, query, more = {}) {
      const before = got.filter((one) => one.id === id).length
      ask(id, query, more)
      await until(`the watch ${id} of ${query} was answered`, () => got.filter((one) => one.id === id).length > before)
      return got.filter((one) => one.id === id)[before]
    },
  }
}

/** The number of the write that a message names in `at`, or nothing where it names none. */
export const writeOf = (message: Message | undefined): number | undefined =>
  typeof message?.at === 'string' && /^\d+\.\d+$/.test(message.at) ? Number(message.at.split('.')[1]) : undefined
