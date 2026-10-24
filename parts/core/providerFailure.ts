/** How a call to a provider failed, by the table of what the model layer then does. */
export type FailureKind = 'unreachable' | 'slow' | 'server' | 'busy' | 'refused' | 'cutOff' | 'notAccepted'

const kinds: readonly string[] = ['unreachable', 'slow', 'server', 'busy', 'refused', 'cutOff', 'notAccepted']

/**
 * What a provider throws to say how a call failed. `retryAfter` is the wait the server asked for, in milliseconds.
 * Any other error a provider throws counts as `server`.
 */
export class ProviderFailure extends Error {
  kind: FailureKind
  retryAfter?: number
  constructor(kind: FailureKind, message?: string, o?: { retryAfter?: number }) {
    super(message ?? `The provider failed: ${kind}.`)
    this.name = 'ProviderFailure'
    this.kind = kinds.includes(kind) ? kind : 'server'
    if (o?.retryAfter !== undefined) this.retryAfter = o.retryAfter
  }
}

/** The failure of what a provider threw: a `ProviderFailure` as it is, anything else as `server`. */
export const failureOf = (error: unknown): ProviderFailure =>
  error instanceof ProviderFailure
    ? error
    : new ProviderFailure('server', error instanceof Error ? error.message : String(error))
