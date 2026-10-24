/** One live connection as the page holds it: what sends a text over it, and what closes it. */
export interface LiveSocket {
  send(text: string): void
  close(): void
}

/** What a live connection tells whoever opened it. */
export interface SocketOn {
  opened(): void
  message(text: string): void
  closed(): void
}

/** What the line of a page reaches the browser through. */
export interface Wired {
  // Opens a WebSocket to an address of the app. Left out, no connection can be opened.
  socket?: (address: string, on: SocketOn) => LiveSocket
  // Carries a piece of work out once, after so many milliseconds, and answers what takes it back.
  wait(work: () => void, ms: number): () => void
  // A number from 0 up to 1, drawn at random.
  random(): number
}

/** What the line tells the page. */
export interface LineOn {
  // The connection stands: every watch is sent now.
  opened(): void
  // One message of the engine arrived, read from JSON.
  message(message: Record<string, unknown>): void
  // An opening failed, or the connection was lost: until it stands again the page asks through the door.
  down(): void
}

/** The line of a page to `/_t/live`: one connection, which is opened again by itself whenever it is lost. */
export interface Line {
  /** Opens the connection where the line holds none and tries for none. */
  open(): void
  /** Whether the connection stands open. */
  up(): boolean
  /** Sends one message where the connection stands open, and answers whether it was sent. */
  send(message: object): boolean
  /** Closes the connection. The line tries for no other until it is opened again. */
  close(): void
}

// The times of the line, in milliseconds. A page and the engine must agree on them, so no project changes one.
const lostAfter = 45_000
const firstWait = 500
const waitSpread = 1000
const longestWait = 30_000

/**
 * Takes what answers the address of the connection, what the line reaches the browser through, and what it tells
 * the page. Answers the line, which is not opened yet. A connection is taken as lost when nothing at all arrived
 * for 45 seconds. After a loss, and after an opening that failed, the line tries again after between half a
 * second and one and a half, picked at random, and doubles the wait after each try that fails, up to thirty
 * seconds: so the pages of an engine that starts again come back spread over time.
 */
export function lineOf(address: () => string, wired: Wired, on: LineOn): Line {
  let socket: LiveSocket | undefined
  let open = false
  // Whether the page wants a connection, and how many tries in a row have failed.
  let wanted = false
  let failed = 0
  let retry: (() => void) | undefined
  let quiet: (() => void) | undefined

  const heard = (): void => {
    quiet?.()
    quiet = wired.wait(() => lost(), lostAfter)
  }

  /** The connection is gone, by either side: another is tried for after its wait. */
  function lost(): void {
    const held = socket
    if (!held) return
    socket = undefined
    open = false
    quiet?.()
    quiet = undefined
    held.close()
    on.down()
    if (!wanted) return
    const wait = Math.min((firstWait + wired.random() * waitSpread) * 2 ** failed, longestWait)
    failed += 1
    retry = wired.wait(() => {
      retry = undefined
      dial()
    }, wait)
  }

  function dial(): void {
    if (!wanted || socket || !wired.socket) return
    let mine: LiveSocket | undefined
    const made = wired.socket(address(), {
      opened() {
        if (socket !== mine) return
        open = true
        failed = 0
        heard()
        on.opened()
      },
      message(text) {
        if (socket !== mine) return
        heard()
        let read: unknown
        try {
          read = JSON.parse(text)
        } catch {
          return
        }
        if (typeof read === 'object' && read !== null && !Array.isArray(read)) on.message({ ...read })
      },
      closed() {
        if (socket === mine) lost()
      },
    })
    mine = made
    socket = made
  }

  return {
    open() {
      if (wanted) return
      wanted = true
      // Where no connection can be opened at all, the page asks through the door from the start.
      if (wired.socket) dial()
      else on.down()
    },
    up: () => open,
    send(message) {
      if (!open || !socket) return false
      socket.send(JSON.stringify(message))
      return true
    },
    close() {
      wanted = false
      failed = 0
      retry?.()
      retry = undefined
      quiet?.()
      quiet = undefined
      const held = socket
      socket = undefined
      open = false
      held?.close()
    },
  }
}
