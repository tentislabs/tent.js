import { readKnown } from './known.ts'
import { runnerFolder } from './fetchPart.ts'
import { releasesOf, shippedRelease, trustedKeys } from './shipped.ts'

// A running engine reads the list of known problems once a day.
const day = 86_400_000

/**
 * Starts the daily look of a running engine at the list of known problems: at once, and then once a day, each look
 * started and not waited for. Where the version of this install is on the list, the log of the program says so;
 * a list that is thrown away is said once (T0026). Answers what stops it. Does nothing for a framework that runs
 * from its own sources, which has no version, and where no address of releases is known.
 */
export function watchKnown(say: (line: string) => void): () => void {
  const shipped = shippedRelease()
  const at = releasesOf()
  if (!shipped || !at) return () => undefined
  let refused = false
  const look = async (): Promise<void> => {
    const { guardedFetch, typedHosts } = await import('../connect/index.ts')
    const home = runnerFolder()
    const fetch = guardedFetch({ mode: 'live', ...(at.typed ? { privateHosts: typedHosts(at.from) } : {}) })
    try {
      const known = await readKnown(home, { from: at.from, keys: trustedKeys(home), fetch })
      const line = known?.versions[shipped.version]
      if (line)
        say(
          `Tent.js ${shipped.version} has a known problem: ${line.problem} It is fixed in ${line.fixed}: update the player.`,
        )
    } catch (error) {
      if (refused) return
      refused = true
      say(
        `T0026: the list of known problems was thrown away: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  void look().catch(() => undefined)
  const timer = setInterval(() => void look().catch(() => undefined), day)
  timer.unref()
  return () => clearInterval(timer)
}
