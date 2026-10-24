import { TentError } from '../../core/index.ts'

/** The part `connect`, as its entry gives it. */
type Connect = typeof import('../../connect/index.ts')

// The part, once a first app needed it: an app that holds no service, and calls nothing out, loads none of it.
let loaded: Connect | undefined

/** Loads `connect`, once for the program, and answers it. */
export async function loadConnect(): Promise<Connect> {
  loaded ??= await import('../../connect/index.ts')
  return loaded
}

/**
 * Answers `connect`, which an app that holds a service loaded when it opened: what works at once, as a member of a
 * handle does, needs it there. Throws T0009 where no app loaded it.
 */
export function connectNow(): Connect {
  if (!loaded) throw new TentError('T0009', 'The part of the services was not loaded when the app opened.')
  return loaded
}
