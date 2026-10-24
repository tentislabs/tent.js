// The bounds of a channel to a driven browser: its opening, and the wait of each command for its answer.
import { TentError } from '../../core/index.ts'

type Params = Record<string, unknown>

// A browser that named the address of its channel opens it at once: one that does not within this is stuck.
const openTime = 10_000

/**
 * How long a command waits for its answer where it states no time of its own: the protocol timeout of Puppeteer
 * (https://pptr.dev/api/puppeteer.connectoptions), past which a browser that took a command answers nothing.
 */
const commandTime = 180_000

/**
 * Takes a socket that is being opened, and the words that name it. Answers once it is open. Throws T0016, and
 * closes it, where it fails or is not open within ten seconds.
 */
export function openedWithin(socket: WebSocket, what: string): Promise<void> {
  return new Promise((done, failed) => {
    const refused = (): void => {
      clearTimeout(timer)
      socket.close()
      failed(new TentError('T0016', `${what} could not be opened.`))
    }
    const timer = setTimeout(refused, openTime)
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer)
        done()
      },
      { once: true },
    )
    socket.addEventListener('error', refused, { once: true })
  })
}

/** The commands of one channel to a browser, each until its answer, its time or the close of the channel. */
export interface Commands {
  /**
   * Sends a command, with the next id added to what it holds, and answers what the browser answered. Throws T0016
   * where no answer came within `within` milliseconds, and fails where the channel closed first.
   */
  send(message: Params & { method: string }, within?: number): Promise<Params>
  /** Hands the command of an id its answer, or the failure the browser answered. */
  answer(id: number, answer: { value: Params } | { error: Error }): void
  /** Tells that the channel closed: what waits for an answer then has none to wait for. */
  closed(): void
}

/**
 * Takes what writes one message on a channel that is open, a socket or a pipe, and the words that name the channel.
 * Answers what sends its commands and waits for their answers.
 */
export function commandsOver(write: (text: string) => void, what: string): Commands {
  let ids = 0
  const held = new Map<number, { done(value: Params): void; failed(error: Error): void; timer: NodeJS.Timeout }>()
  const answer = (id: number, told: { value: Params } | { error: Error }): void => {
    const one = held.get(id)
    if (!one) return
    held.delete(id)
    clearTimeout(one.timer)
    if ('error' in told) one.failed(told.error)
    else one.done(told.value)
  }
  return {
    closed: () => {
      for (const id of [...held.keys()]) answer(id, { error: new Error(`${what} closed.`) })
    },
    send: (message, within = commandTime) => {
      const id = ++ids
      const answered = new Promise<Params>((done, failed) => {
        const late = `The browser did not answer ${message.method} within ${within / 1000} seconds.`
        const timer = setTimeout(() => answer(id, { error: new TentError('T0016', late) }), within)
        // The time of a command holds the program open no longer than its channel does.
        timer.unref()
        held.set(id, { done, failed, timer })
      })
      try {
        write(JSON.stringify({ id, ...message }))
      } catch (error) {
        answer(id, { error: error instanceof Error ? error : new Error(String(error)) })
      }
      return answered
    },
    answer,
  }
}
