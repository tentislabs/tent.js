import { copyFileSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'

// Windows holds a file a little while after its last handle was closed, as a scanner of the system reads it: a
// removal or a move then fails with EPERM, EBUSY or EACCES, and works when it is tried again.
const held = new Set(['EPERM', 'EBUSY', 'EACCES'])
const tries = 20
const wait = 50

/** Waits a moment, in a function that does not wait for a promise. */
const paused = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Moves a file onto a place, again a little later while the system still holds one of them. */
function moved(from: string, to: string): void {
  for (let tried = 1; ; tried++) {
    try {
      renameSync(from, to)
      return
    } catch (error) {
      if (tried >= tries || !held.has(String(Reflect.get(Object(error), 'code')))) throw error
      paused(wait)
    }
  }
}

/**
 * Takes a file and the place of a data file that no connection holds. Puts a copy of the file in that place: the
 * copy is whole beside the old file before it takes its place, and the two files that SQLite kept beside the old
 * file are removed with it, since they hold writes of the old file alone. Throws what the disk refused; where the
 * copy could not be made beside it, the old file and its two files are as they were.
 */
export function swapIn(from: string, place: string): void {
  mkdirSync(dirname(place), { recursive: true })
  const coming = `${place}.coming`
  copyFileSync(from, coming)
  for (const beside of ['-wal', '-shm'])
    rmSync(`${place}${beside}`, { force: true, maxRetries: tries, retryDelay: wait })
  moved(coming, place)
}
