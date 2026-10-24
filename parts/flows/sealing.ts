import { TentError } from '../core/index.ts'
import type { RunnerEnv } from './face.ts'
import { asSaved } from './kept.ts'
import { isWritten } from '../core/internal.ts'

// The one member of what a sealed step saves: the sealed text, which nothing but its run opens.
const sealedKey = 'tent.sealed'

/** Where a saved result stands: its run, its step and its repeat, which a sealed one is bound to. */
interface Place {
  run: string
  name: string
  repeat: number
}

const noSeal = (): TentError =>
  new TentError('T0019', 'A sealed step result needs the key of the secrets, and the runner was handed none.', {
    fix: 'Give the engine the key of the secrets, as `TENT_SECRET_KEY` or as `secret.key` of its data folder.',
  })

/** Whether a saved result is sealed. */
const isSealedResult = (saved: unknown): saved is Record<string, string> =>
  isWritten(saved) && typeof saved[sealedKey] === 'string' && Object.keys(saved).length === 1

/** The sealed text of a saved result, for whoever holds the key and opens it as its run would: nothing for one that is not sealed. */
export const sealedTextOf = (saved: unknown): string | undefined =>
  isSealedResult(saved) ? saved[sealedKey] : undefined

/**
 * Takes what a step answered, as it is saved. Answers what is saved of it where the step is sealed: the sealed
 * text alone, bound to its run, its step and its repeat, with its size. Throws T0019 with no key at hand.
 */
export function sealedResult(env: RunnerEnv, at: Place, value: unknown): { value: unknown; size: number } {
  if (!env.seal) throw noSeal()
  return asSaved({ [sealedKey]: env.seal(at, value) })
}

/** Takes a saved result. Answers it as its run reads it back: a sealed one opened, any other as it is. */
export function openedResult(env: RunnerEnv, at: Place, saved: unknown): unknown {
  if (!isSealedResult(saved)) return saved
  if (!env.open) throw noSeal()
  return env.open(at, saved[sealedKey])
}
