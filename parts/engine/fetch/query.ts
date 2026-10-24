import { underWay } from '../context.ts'
import { notPure } from '../rooms/pure.ts'

/**
 * Holds a `fetch` of backend code to what a query may do: nothing of the network. Throws T4101 where the call
 * that is under way is a query or the arrow of a rule, and takes every other one.
 */
export function heldForQuery(): void {
  const kind = underWay()?.work.kind
  if (kind === 'query' || kind === 'rule') throw notPure('reached the network')
}
