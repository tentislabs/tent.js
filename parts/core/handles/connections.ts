import type { Marker } from '../definition.ts'
import { member } from '../handle.ts'

/** A connection of a user to a service. */
interface Connection {
  service: string
  account: string
  scopes: string[]
  at: Date
}

/** The handle of the accounts that users connected. `end` answers a promise for a service that takes a token back. */
interface Connections {
  start(service: Marker, o?: { back?: string; account?: string }): string
  list(user?: string): Connection[]
  end(service: Marker, o?: { account?: string; user?: string }): undefined | Promise<void>
}

export const connections: Connections = {
  start: member('connections', 'start'),
  list: member('connections', 'list'),
  end: member('connections', 'end'),
}
