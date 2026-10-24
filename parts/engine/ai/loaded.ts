import { loadConnect } from '../services/loaded.ts'

/** The part `ai`, as its entry gives it. */
type Ai = typeof import('../../ai/index.ts')

// The part, once a first app needed it: an app that holds no model loads none of it.
let loaded: Ai | undefined

/** Loads `ai`, once for the program, with `connect`, whose guarded fetch it reaches its providers by. Answers it. */
export async function loadAi(): Promise<Ai> {
  await loadConnect()
  loaded ??= await import('../../ai/index.ts')
  return loaded
}

/** Answers `ai` where an app loaded it already, and nothing where none did. */
export const aiIfLoaded = (): Ai | undefined => loaded
