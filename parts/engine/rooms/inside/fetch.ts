import { TentError } from '../../../core/index.ts'
import type { Bounds } from '../callables.ts'
import { intoOf, outOf } from '../callables.ts'
import type { InsideWays } from './handed.ts'
import { askerIn, keeperIn } from './handed.ts'
import type { Carry } from './runtime.ts'

/**
 * Takes the ways of the room, how a call is carried, and the bounds of a value. Answers the `fetch` of the code in
 * this heap: each request crosses to the guarded fetch of the engine as the call's own, with its body as a stream,
 * and its answer crosses back with its body pulled piece by piece.
 */
export function fetchOver(ways: InsideWays, carry: Carry, bounds: Bounds): typeof fetch {
  return async (input, init) => {
    const call = carry.current()
    if (call === undefined) throw new TentError('T0013', '`fetch` was used with no call under way.')
    const request = new Request(input, init)
    const answer = intoOf(await ways.fetch(call, outOf(request, keeperIn(call), bounds)), askerIn(ways, call, bounds))
    if (!(answer instanceof Response)) throw new TentError('T0009', 'The engine answered a fetch with no response.')
    return answer
  }
}
