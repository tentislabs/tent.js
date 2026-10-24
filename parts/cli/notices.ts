import { spawn } from 'node:child_process'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { keptKnown, runnerFolder, shippedRelease } from '../engine/index.ts'

// A list is read at most once a day by the commands.
const day = 86_400_000

/** The file of the install that keeps the moment of the last look that read no list, as no network gives none. */
const triedFile = (home: string): string => join(home, 'known.tried')

/** The moment of the last look that read no list, or 0 where there was none. */
function triedAt(home: string): number {
  try {
    const at = Number(readFileSync(triedFile(home), 'utf8').trim())
    return Number.isFinite(at) ? at : 0
  } catch {
    return 0
  }
}

/** Keeps the moment of a look that read no list, so that the commands of the next day look no more than once. */
export function keepTried(home: string): void {
  try {
    writeFileSync(`${triedFile(home)}.${process.pid}`, `${Date.now()}\n`)
    renameSync(`${triedFile(home)}.${process.pid}`, triedFile(home))
  } catch {
    // An install folder that cannot be written keeps no moment: the look is tried again by the next command.
  }
}

/**
 * Says, in one line, that the version of this install is on the list of known problems, as the install last read
 * it. Where that list is older than a day, or was never read, and no look in the last day read nothing, it starts
 * the look at it, which a program of its own does, so that no command waits for it. `TENT_NOTICES=off` switches
 * both off. A framework that runs from its own sources has no version, and says nothing.
 */
export function noticed(told: (line: string) => void): void {
  if (process.env.TENT_NOTICES === 'off') return
  const shipped = shippedRelease()
  if (!shipped) return
  const home = runnerFolder()
  const kept = keptKnown(home)
  const line = kept?.versions[shipped.version]
  if (line)
    told(
      `Tent.js ${shipped.version} has a known problem: ${line.problem} It is fixed in ${line.fixed}: type tent update.`,
    )
  if (Date.now() - Math.max(kept?.readAt ?? 0, triedAt(home)) < day) return
  const look = spawn(process.execPath, [fileURLToPath(new URL('./knownLook.ts', import.meta.url))], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  look.on('error', () => undefined)
  look.unref()
}
