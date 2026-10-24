import { guardedFetch, typedHosts } from '../connect/index.ts'
import { readKnown, releasesOf, runnerFolder, trustedKeys } from '../engine/index.ts'
import { keepTried } from './notices.ts'

/**
 * The look at the list of known problems that a command starts and does not wait for: it reads the list from
 * where releases are served, held to five seconds, and keeps it in the folder of the install. A list that is
 * thrown away leaves the one before as it was, and a look that read none keeps its moment.
 */
async function lookAtKnown(): Promise<void> {
  const at = releasesOf()
  if (!at) return
  const home = runnerFolder()
  const fetch = guardedFetch({ mode: 'live', ...(at.typed ? { privateHosts: typedHosts(at.from) } : {}) })
  const read = await readKnown(home, { from: at.from, keys: trustedKeys(home), fetch }).catch(() => undefined)
  if (!read) keepTried(home)
}

if (import.meta.main) await lookAtKnown()
