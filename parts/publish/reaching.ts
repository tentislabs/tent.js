import type { GuardedFetch } from '../connect/index.ts'
import type { Target } from './target.ts'

/** What a request to a target is sent with: the target, and the fetch it goes through. */
export interface Reaching {
  to: Target
  fetch: GuardedFetch
}
