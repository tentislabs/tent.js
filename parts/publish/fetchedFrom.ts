import type { History, Point } from '../history/index.ts'
import { blobsFetched } from './blobsFetched.ts'
import { idsAtOnce } from './limits.ts'
import type { Reaching } from './reaching.ts'
import { printsOf } from './send.ts'
import { asked } from './target.ts'

/**
 * Fetches from a target the points that lead to one of its pointers or points and that this history lacks, a page
 * at a time, with their blobs, and takes them. Answers the point the pointer stood on, or nothing where the target
 * holds no such pointer.
 */
export async function fetchedFrom(
  o: Reaching,
  history: History,
  from: string,
  have: string[],
): Promise<string | undefined> {
  const points: Point[] = []
  let head: string | undefined
  let after: string | undefined
  for (;;) {
    const page = Object(await asked(o, '/_t/sync/points', { from, have, ...(after ? { after } : {}) }))
    if (typeof page.head === 'string') head = page.head
    if (Array.isArray(page.points)) points.push(...page.points)
    if (typeof page.next !== 'string') break
    after = page.next
  }
  const prints = [...new Set(points.flatMap(printsOf))]
  const lacking = new Set<string>()
  for (let at = 0; at < prints.length; at += idsAtOnce) {
    const part = prints.slice(at, at + idsAtOnce)
    const here = new Set(history.have({ points: [], blobs: part }).blobs)
    for (const print of part) if (!here.has(print)) lacking.add(print)
  }
  const blobs = Object.fromEntries(await blobsFetched(o, [...lacking]))
  history.take({ blobs, points })
  return head
}
