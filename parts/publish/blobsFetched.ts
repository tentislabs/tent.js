import { blobsOf } from './blobsBody.ts'
import { idsAtOnce } from './limits.ts'
import type { Reaching } from './reaching.ts'
import { asked } from './target.ts'

/**
 * Takes a target and the fingerprints of the blobs that are wanted of it. Asks for them a share at a time, since a
 * target answers as many as fit one answer, and asks again for the rest. Answers each blob that was asked for and
 * sent, by its fingerprint: a blob it sent that was not asked for is dropped, and an answer that brings none of
 * those asked ends the asking, so a target that answers others never holds it.
 */
export async function blobsFetched(o: Reaching, wanted: string[]): Promise<Map<string, Uint8Array>> {
  const got = new Map<string, Uint8Array>()
  for (let left = [...new Set(wanted)]; left.length; ) {
    const share = left.slice(0, idsAtOnce)
    const bytes = await asked(o, '/_t/sync/blobs', { want: share })
    const found = (bytes instanceof Uint8Array ? blobsOf(bytes) : []).filter(([print]) => share.includes(print))
    if (!found.length) break
    for (const [print, one] of found) got.set(print, one)
    left = left.filter((print) => !got.has(print))
  }
  return got
}
