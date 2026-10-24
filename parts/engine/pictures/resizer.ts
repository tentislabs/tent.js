import { existsSync } from 'node:fs'
import { fetchPart } from '../fetchPart.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { partsOf } from '../parts.ts'

/** What this program knows of the resizer in one folder of parts: where it stands, a fetch under way, a failed one. */
interface Known {
  folder?: string
  fetching?: boolean
  failedAt?: number
}

// What is known of the resizer, by the folder that the parts lie in: an engine may be told another than the runner's.
const known = new Map<string, Known>()

// How long after a fetch that failed the next is started, in milliseconds: a server that is down is not asked at each picture.
const again = 600_000

/** What is known of the resizer for an app, by the folder of its parts. */
function knownFor(o: Opened): Known {
  const key = partsOf(o).folder ?? process.env.TENT_HOME ?? ''
  const found = known.get(key) ?? {}
  known.set(key, found)
  return found
}

/** The folder of the resizer where it stands there, fetched in this program, and nothing otherwise. Starts nothing. */
export function resizerThere(o: Opened): string | undefined {
  const { folder } = knownFor(o)
  return folder !== undefined && existsSync(folder) ? folder : undefined
}

// The fetch of the resizer that is under way, by the folder that the parts lie in.
const fetching = new Map<string, Promise<void>>()

/** Starts the fetch of the resizer for an app, one at a time, where none failed a while ago, and answers it. */
function started(o: Opened): Promise<void> | undefined {
  const state = knownFor(o)
  const key = partsOf(o).folder ?? process.env.TENT_HOME ?? ''
  if (state.fetching) return fetching.get(key)
  if (state.failedAt !== undefined && performance.now() - state.failedAt < again) return undefined
  state.fetching = true
  const { folder, from } = partsOf(o)
  const made = fetchPart('sharp', {
    mode: o.mode,
    time: storedLimit(o.description, 'fetchTime'),
    ...(folder === undefined ? {} : { folder }),
    ...(from === undefined ? {} : { from }),
  }).then(
    (place) => {
      state.folder = place
      state.fetching = false
    },
    () => {
      state.failedAt = performance.now()
      state.fetching = false
    },
  )
  fetching.set(key, made)
  return made
}

/**
 * The folder of the resizer where it stands there. Otherwise starts its fetch, one at a time, and answers nothing
 * at once: the image door waits for no part. A fetch that failed is started again after a while.
 */
export function resizerFolder(o: Opened): string | undefined {
  const there = resizerThere(o)
  if (there === undefined) void started(o)
  return there
}

/**
 * The folder of the resizer, once its fetch has ended, or nothing where it failed: an export, which answers no
 * visitor, waits for it, so the same app gives the same files each time.
 */
export async function resizerWaited(o: Opened): Promise<string | undefined> {
  if (resizerThere(o) === undefined) await started(o)
  return resizerThere(o)
}
