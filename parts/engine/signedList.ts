import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GuardedFetch } from '../connect/index.ts'
import { TentError } from '../core/index.ts'
import { signedBy } from './signedBy.ts'

/** The kinds of signed list whose newest `made` an install keeps in `seen.json`. */
export type Seen = 'releases' | 'known' | 'trust'

/** An update or a list that is refused: nothing changes. */
export const refusedUpdate = (words: string): TentError =>
  new TentError('T0026', words, {
    fix: 'Where releases are served from a copy, see that the copy is whole; else wait for the next release and try again.',
  })

/** What `seen.json` of an install holds: the `made` of the newest list of each kind that it took. */
function seenOf(home: string): Partial<Record<Seen, number>> {
  const file = join(home, 'seen.json')
  if (!existsSync(file)) return {}
  try {
    return Object(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return {}
  }
}

/** Writes the `made` of a list that the install took, whole beside the old file and then in its place. */
export function sawList(home: string, kind: Seen, made: number): void {
  const seen = { ...seenOf(home), [kind]: made }
  const file = join(home, 'seen.json')
  writeFileSync(`${file}.${process.pid}`, `${JSON.stringify(seen, null, 2)}\n`)
  renameSync(`${file}.${process.pid}`, file)
}

/** Fetches one file whole through the guarded fetch, held to a time and a size. Throws what the fetch threw. */
async function fetchedBytes(
  fetch: GuardedFetch,
  address: string,
  o: { time: number; size?: number },
): Promise<Uint8Array> {
  const answer = await fetch(address, { time: o.time, ...(o.size === undefined ? {} : { size: o.size }) })
  if (!answer.ok) throw new Error(`${new URL(address).host} answered ${answer.status} for ${new URL(address).pathname}`)
  return new Uint8Array(await answer.arrayBuffer())
}

/**
 * Takes where releases are served, the path of a signed list under it, the keys it may be signed with, and the
 * fetch. Fetches the list and its signatures. Answers the list and its bytes. Throws T0026 for a list that no key
 * signed, that is not of its format, or whose `made` is older than the one of its kind this install last took,
 * which is named in `seen`; and what the fetch threw where it could not be fetched.
 */
export async function signedList(
  from: string,
  path: string,
  o: { keys: string[]; fetch: GuardedFetch; time: number; format: string; home?: string; seen?: Seen },
): Promise<{ list: Record<string, unknown>; bytes: Uint8Array }> {
  const base = from.endsWith('/') ? from : `${from}/`
  const address = new URL(path, base).href
  const bytes = await fetchedBytes(o.fetch, address, { time: o.time, size: 16 * 1024 * 1024 })
  const signatures = new TextDecoder().decode(
    await fetchedBytes(o.fetch, `${address}.sig`, { time: o.time, size: 65_536 }).catch(() => new Uint8Array()),
  )
  if (!signedBy(bytes, signatures, o.keys))
    throw refusedUpdate(`${path} is signed by no key this install trusts: it was not taken.`)
  let list: Record<string, unknown>
  try {
    list = Object(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    throw refusedUpdate(`${path} is no list: it was not taken.`)
  }
  if (list.format !== o.format || typeof list.made !== 'number')
    throw refusedUpdate(`${path} is not of the form ${o.format}: it was not taken.`)
  const before = o.home && o.seen ? seenOf(o.home)[o.seen] : undefined
  if (before !== undefined && list.made < before)
    throw refusedUpdate(`${path} is older than the one this install took before: an old list is not taken again.`)
  return { list, bytes }
}

/** Fetches one file of a release whole, held to the size its list states and to a time. Throws what the fetch threw. */
export const releaseFile = (
  fetch: GuardedFetch,
  address: string,
  o: { time: number; size: number },
): Promise<Uint8Array> => fetchedBytes(fetch, address, o)
