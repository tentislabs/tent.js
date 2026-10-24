import type { Caller } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import type { About } from '../web/proxy.ts'

/** What an address of the door is handed once the steps of the web that it passes are behind the request. */
interface Reached {
  app: Opened
  request: Request
  // What `match` answered for the request.
  matched: object
  about: About
  caller: Caller
  // When the request reached the door, by the clock of the runtime that never jumps.
  began: number
}

/**
 * What answers a request on one machine, in two halves, so that a reader passes the steps of the door itself for
 * a request that it then hands to its writer. `passes` finds the address and carries out steps 2 to 4: it answers
 * what the address is handed, or the refusal. `answers` has the address answer a request that passed.
 */
export interface Answering<Passed extends object> {
  passes(request: Request): Promise<Passed | Response>
  answers(request: Request, passed: Passed): Promise<Response>
}

/**
 * One address of the door. `order` is its place among the addresses, which are tried in that order. `match`
 * answers what it read of a request that is for it, and false for any other. `steps` are the steps of the door that
 * a request for it passes, and `handle` answers it.
 */
export interface Address {
  order: number
  match(request: Request): object | false
  steps: number[]
  // What step 2 holds a request for this address to, where that is not what the app holds every request to: the
  // most bytes of its body, and the other sites whose pages may send it a request that changes something.
  own?(app: Opened, matched: object): { size: number; sites: string[] | 'any' } | undefined
  // The answer of a refusal by steps 2 to 4, where the address answers in a form of its own, as the API does.
  refused?(app: Opened, name: string, error: unknown): Response
  handle(o: Reached): Promise<Response>
}
