import type { Caller } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { servedBy } from '../versions.ts'
import { releaseOf, versionFor } from './release.ts'

/**
 * Takes an app and the caller of a request that names no version. Answers the app as the version that the caller
 * is given serves it: while a release goes, by the caller the door found, and the running version otherwise.
 */
export function releasedFor(o: Opened, caller: Caller): Opened {
  const version = versionFor(o, caller)
  return version === undefined ? o : (servedBy(o, version) ?? o)
}

/**
 * Takes an app, the caller of a request, and the version the request names, which a page sends as the version it
 * was drawn with. Answers the app as that version serves it, while it is served; the new version of a release
 * serves only a caller the release gives it, any other is served by the version it is given, and once the release
 * was taken back it serves nobody. Nothing where the version is not served: the page follows the running one.
 */
export function namedFor(o: Opened, caller: Caller, named: unknown): Opened | undefined {
  if (named === undefined) return releasedFor(o, caller)
  const release = releaseOf(o)
  if (release && named === release.to) {
    if (release.state === 'back') return undefined
    if (versionFor(o, caller) !== release.to) return releasedFor(o, caller)
  }
  return servedBy(o, named)
}
