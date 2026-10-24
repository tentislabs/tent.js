import type { Caller } from '../../core/index.ts'
import type { LiveOpened } from '../liveDoor.ts'
import type { TablesRead } from '../watched.ts'
import type { Connection, Socket } from './connection.ts'
import type { KeptRows } from './rows.ts'

/** One watch of one page. `holds` is the mark of the answer that the page holds. */
export interface Watch {
  id: string
  on: Connected
  group: Group
  holds?: string
  // It waits for a write that its page has seen and this machine does not hold yet: no answer is sent it meanwhile.
  waiting?: true
}

/** One live connection that is open, as the hub holds it. */
export interface Connected {
  socket: Socket
  opened: LiveOpened
  // Who its caller was when it was opened: a caller who is another one now is told so, and the connection is closed.
  who: string
  watches: Map<string, Watch>
  // The messages that it sent in the second that began at `since`.
  count: number
  since: number
  // When it opened, by the clock of the app: the time it stands open is counted from then.
  at: number
  // A sign of life was sent, and its answer has not come.
  due: boolean
  closed: boolean
  face: Connection
  // The caller as they were built in the turn of that number, so that one turn reads a user once.
  turn: number
  built?: Caller
  // Takes back the timer that closes the connection at its moment, where it has one.
  stop?: () => void
}

/** The watches of one version, query, input and caller, which share one run. */
export interface Group {
  key: string
  // The version that its watches name, and nothing for watches that follow the running one.
  version: string
  query: string
  input: unknown
  who: string
  watches: Set<Watch>
  // What its last run read, and nothing before its first run.
  reads?: TablesRead
  // The mark of the answer that was sent last, and what is kept of it where it was a list of rows.
  mark?: string
  kept?: KeptRows
  page?: boolean
  // It waits for its run, its run is under way, and a write was committed while its run was under way.
  marked: boolean
  running: boolean
  again: boolean
  // Takes back the timer of a query that states `refresh`.
  cancel?: () => void
  // It watches `working` of an agent, whose entries change one at a time.
  member?: true
}
