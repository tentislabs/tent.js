import type { WireError } from '../../core/index.ts'
import { partHeld } from './parts.ts'
import { seenOf } from './press.ts'

/** One step of a followed run, as the page holds it. */
export interface StepShown {
  name: string
  repeat: number
  tool?: string
  state: string
  ms?: number
  runs?: string[]
}

/** One ask that waits for the person, as the page holds it. */
export interface AskShown {
  run: string
  step: string
  repeat: number
  n: number
  tool: string
  input: unknown
  call?: string
  sequence?: unknown
  more?: boolean
}

/** What a step of a followed run said last. */
export interface SaidShown {
  step: string
  repeat: number
  value: unknown
}

/** A run as a page that follows it holds it: what the engine said of it so far. */
export interface FollowedRun {
  run: string
  state: string
  steps: StepShown[]
  asks: AskShown[]
  said: SaidShown[]
  // The text of the `model` step that is written now, and the step it belongs to.
  text: string
  reasoning: string
  step?: string
  // The spoken sentences, in their order, each a file.
  sounds: string[]
  used: Record<string, number>
  agent?: string
  // Of a run of a flow or of an action whose definition a call of `{ run, stop: true }` stops it by: that definition.
  flow?: string
  answer?: unknown
  error?: WireError
}

/** The runs that a page follows over its live connection. */
export interface FollowedRuns {
  /** Follows a run: `heard` is called each time what the page holds of it changed. Answers what stops following. */
  follow(run: string, heard: () => void): () => void
  /** What the page holds of a run it follows. */
  held(run: string): FollowedRun | undefined
  /** Takes one message of the engine. Answers whether it was a message of a followed run. */
  told(message: Record<string, unknown>): boolean
  /** The connection stands again: every run that is followed is asked for anew. */
  again(): void
}

/**
 * Takes what sends a message over the live connection, and what loads the part `agent`. Answers the runs that
 * the page follows: their work lies in that part, which most pages never need, so it is loaded at the first follow,
 * and a follow made before it stands begins once it does. Where the part cannot be loaded, the run is held as
 * failed, with the error a caller sees, and the view that follows it is told.
 */
export function followedRuns(send: (message: object) => boolean, load: () => Promise<unknown>): FollowedRuns {
  let runs: FollowedRuns | undefined
  // The runs whose follow could not begin, since the part did not load.
  const unloaded = new Map<string, FollowedRun>()
  const made = (): FollowedRuns | undefined => {
    runs ??= partHeld('agent')?.followedRuns(send)
    return runs
  }
  return {
    follow(run, heard) {
      const now = made()
      if (now) return now.follow(run, heard)
      let stop: (() => void) | undefined
      let gone = false
      load().then(
        () => {
          if (!gone) stop = made()?.follow(run, heard)
        },
        () => {
          if (gone) return
          unloaded.set(run, {
            run,
            state: 'failed',
            steps: [],
            asks: [],
            said: [],
            text: '',
            reasoning: '',
            sounds: [],
            used: {},
            error: seenOf(undefined),
          })
          heard()
        },
      )
      return () => {
        gone = true
        stop?.()
      }
    },
    held: (run) => made()?.held(run) ?? unloaded.get(run),
    told: (message) => made()?.told(message) ?? false,
    again: () => made()?.again(),
  }
}
