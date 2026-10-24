import type { Link } from '../copy/link.ts'

/** What a page asks for with a `watch`: its own name for the watch, the query and its input, and what it holds. */
export interface Watching {
  id: string
  query: unknown
  input: unknown
  // The version of the page, and the running one where it names none.
  version?: string
  // The mark of the answer that the page holds, where it holds one.
  have?: string
  // The write that the answer must hold, on an app with readers: a mark, in the form of `Tent-At`.
  seen?: unknown
}

/**
 * One live connection, as a message that arrived on it is handed it: what the three messages of a page do, and
 * the closing of a connection whose message has not the form of its name.
 */
export interface Connection {
  /** Watches a query. A second watch under an id that is still watched takes its place. */
  watch(asked: Watching): void
  /** Follows a run: where it stands is sent, and then its parts. */
  runWatch(asked: { id: string; run: string }): void
  /** Stops the watch of that id. An id that is not watched changes nothing. */
  unwatch(id: string): void
  /** Takes the answer to a sign of life. */
  alive(): void
  /** In the mode `test`: from now on the page is told the write that the answers of its watches hold. */
  heard(): void
  /** In development: takes what a page told of a view that failed in the browser, and shows it on every open page. */
  thrown(message: object): void
  /** Closes the connection, with every watch it holds. */
  close(): void
}

/**
 * One message of the live connection that a page sends, by its name in `t`. `handle` is handed the connection it
 * arrived on and the message as it was read: one JSON object.
 */
export interface LiveMessage {
  t: string
  handle(connection: Connection, message: object): void
}

/**
 * One end of a live connection as the hub holds it: a link whose frames are texts, which also says how many bytes
 * wait to be taken by the other side.
 */
export interface Socket extends Link {
  waiting(): number
}
