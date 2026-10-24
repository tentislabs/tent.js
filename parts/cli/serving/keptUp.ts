import { guardedFetch, typedHosts } from '../../connect/index.ts'
import { updateInstall } from '../install/updateInstall.ts'
import { releasesOf, runnerFolder, shippedRelease, signedList, trustedKeys } from '../../engine/index.ts'

// A server looks for a release to take once a day, as it looks at the list of known problems.
const day = 86_400_000

/** The three numbers of a version, compared as numbers. */
const numbers = (version: string): number[] => version.split('.').map(Number)
const newer = (a: string, b: string): boolean => {
  const [x, y] = [numbers(a), numbers(b)]
  for (let k = 0; k < 3; k++) if ((x[k] ?? 0) !== (y[k] ?? 0)) return (x[k] ?? 0) > (y[k] ?? 0)
  return false
}

/**
 * Takes what `--update` of `tent start` names, what says a line in the log, and what ends the server with 75 once
 * it took a release. Looks at once, and then once a day: with `fixes` for the newest release of its own line that
 * is marked as a fix, with `all` for the newest of its major version. It fetches one as `tent update` does, and
 * then the server is ended, so that the launcher starts it again on the new version. Under the npm door, and for a
 * framework that runs from its sources, it takes none, and says so once. Answers what stops it.
 */
export function keptUp(o: { update: 'fixes' | 'all'; say(line: string): void; took(): void }): () => void {
  const shipped = shippedRelease()
  const at = releasesOf()
  if (!shipped || !at || shipped.player.split(/[\\/]/).includes('node_modules')) {
    o.say(
      'A server under the npm door, or one that runs from the sources, takes no release by itself: update it with npm.',
    )
    return () => undefined
  }
  const home = runnerFolder()
  const [major, minor] = numbers(shipped.version)
  let busy = false
  const look = async (): Promise<void> => {
    if (busy) return
    busy = true
    try {
      const fetch = guardedFetch({ mode: 'live', ...(at.typed ? { privateHosts: typedHosts(at.from) } : {}) })
      const keys = trustedKeys(home)
      const { list } = await signedList(at.from, 'releases.json', {
        keys,
        fetch,
        format: 'tent.releases/1',
        time: 30_000,
        home,
        seen: 'releases',
      })
      const versions: unknown = list.versions
      const taken = (Array.isArray(versions) ? versions : [])
        .map((one) => ({
          version: String(Reflect.get(Object(one), 'version')),
          fix: Reflect.get(Object(one), 'fix') === true,
        }))
        .filter(({ version, fix }) => {
          const [x, y] = numbers(version)
          if (x !== major || !newer(version, shipped.version)) return false
          return o.update === 'all' || (fix && y === minor)
        })
        .sort((a, b) => (newer(a.version, b.version) ? -1 : 1))[0]
      if (!taken) return
      await updateInstall(home, { version: taken.version, from: at.from, keys, fetch })
      o.say(`Tent.js ${taken.version} was taken by itself: the server starts again on it.`)
      o.took()
    } catch (error) {
      o.say(`No release was taken by itself: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      busy = false
    }
  }
  void look()
  const timer = setInterval(() => void look(), day)
  timer.unref()
  return () => clearInterval(timer)
}
