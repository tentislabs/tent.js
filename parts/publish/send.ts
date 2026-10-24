import type { History, Point } from '../history/index.ts'
import { blobsBody } from './blobsBody.ts'
import { idsAtOnce, syncLimit } from './limits.ts'
import type { Reaching } from './reaching.ts'
import { asked } from './target.ts'

/** Which of the named points and blobs a target holds, asked a thousand at a time. */
async function heldThere(
  o: Reaching,
  ids: { points?: string[]; blobs?: string[] },
): Promise<{ points: Set<string>; blobs: Set<string> }> {
  const held = { points: new Set<string>(), blobs: new Set<string>() }
  for (const kind of ['points', 'blobs'] as const) {
    const all = ids[kind] ?? []
    for (let at = 0; at < all.length; at += idsAtOnce) {
      const answer = Object(
        await asked(o, '/_t/sync/have', {
          [kind]: all.slice(at, at + idsAtOnce),
          [kind === 'points' ? 'blobs' : 'points']: [],
        }),
      )
      for (const id of Array.isArray(answer[kind]) ? answer[kind] : []) if (typeof id === 'string') held[kind].add(id)
    }
  }
  return held
}

/** Puts points in an order where each stands after its parents. */
export function oldestFirst(points: Map<string, Point>): Point[] {
  const ordered: Point[] = []
  const placed = new Set<string>()
  // Walked by hand and not by calling itself: a chain of many thousand points holds no stack of that depth.
  for (const first of [...points.values()].sort((a, b) => a.at - b.at)) {
    const stack: [Point, number][] = [[first, 0]]
    while (stack.length) {
      const top = stack[stack.length - 1]
      const [point, next] = top
      if (placed.has(point.id)) {
        stack.pop()
        continue
      }
      const parent = point.parents[next] === undefined ? undefined : points.get(point.parents[next])
      top[1]++
      if (next < point.parents.length) {
        if (parent && !placed.has(parent.id)) stack.push([parent, 0])
        continue
      }
      placed.add(point.id)
      ordered.push(point)
      stack.pop()
    }
  }
  return ordered
}

/**
 * The points that lead to a point of a history and that a target lacks, each after its parents. They are asked
 * for newest first, a thousand at a time: a point the target holds holds what it comes from too.
 */
export async function lackingThere(o: Reaching, history: History, head: string): Promise<Point[]> {
  const order: Point[] = []
  const seen = new Set<string>()
  for (let at = 0, open = [head]; at < open.length; at++) {
    const point = seen.has(open[at]) ? undefined : history.read(open[at])
    if (!point) continue
    seen.add(point.id)
    order.push(point)
    open.push(...point.parents)
  }
  const lacking = new Map<string, Point>()
  const held = new Set<string>()
  const holdFrom = (id: string): void => {
    for (const open = [id]; open.length; ) {
      const at = open.pop()
      if (at === undefined || held.has(at)) continue
      held.add(at)
      open.push(...(history.read(at)?.parents ?? []))
    }
  }
  for (let at = 0; at < order.length; ) {
    const batch: string[] = []
    while (batch.length < idsAtOnce && at < order.length) {
      const id = order[at++].id
      if (!held.has(id)) batch.push(id)
    }
    if (!batch.length) break
    const there = await heldThere(o, { points: batch })
    for (const id of batch) if (there.points.has(id)) holdFrom(id)
    for (const id of batch) {
      const point = held.has(id) ? undefined : history.read(id)
      if (point) lacking.set(id, point)
    }
  }
  for (const id of held) lacking.delete(id)
  return oldestFirst(lacking)
}

/** The fingerprints of what a point needs beside it: the bytes of its files and of its description. */
export const printsOf = (point: Point): string[] => [
  ...new Set([...Object.values(point.files ?? {}), ...(point.description ? [point.description] : [])]),
]

/**
 * Sends blobs to a target in bodies of at most `syncSize`: a blob larger than that travels alone, in a request of
 * its own length. Answers how many were sent.
 */
async function sendBlobs(o: Reaching, blobs: [string, Uint8Array][], path = '/_t/sync/blobs'): Promise<number> {
  const most = syncLimit(undefined, 'syncSize')
  let group: [string, Uint8Array][] = []
  let size = 0
  const flush = async (): Promise<void> => {
    if (group.length) await asked(o, path, blobsBody(group))
    group = []
    size = 0
  }
  for (const blob of blobs) {
    const length = blob[1].length + 100
    if (length > most) {
      await flush()
      await asked(o, path, blobsBody([blob]))
      continue
    }
    if (size + length > most) await flush()
    group.push(blob)
    size += length
  }
  await flush()
  return blobs.length
}

/** Sends the files of a bundle that a target lacks, each as large as a file of a bundle may be. Answers how many. */
export async function sendBundle(
  o: Reaching,
  bundle: [string, Uint8Array][],
  files: Record<string, string>,
): Promise<number> {
  const prints = [...new Set(Object.values(files))]
  const held = await heldThere(o, { blobs: prints })
  const bytes = new Map(bundle.map(([path, one]) => [files[path], one]))
  const lacking = prints
    .filter((print) => !held.blobs.has(print))
    .map((print): [string, Uint8Array] => [print, bytes.get(print) ?? new Uint8Array()])
  return sendBlobs(o, lacking, '/_t/sync/blobs?for=bundle')
}

/**
 * Sends points to a target, oldest first, each after its own blobs, in pages: the blobs of a page that the target
 * lacks first, then the page. The last page carries `move` where one is given. Answers what the last answered and
 * how many blobs were sent.
 */
export async function sendPoints(
  o: Reaching,
  history: History,
  points: Point[],
  more: { move?: object; path?: string; blobsPath?: string } = {},
): Promise<{ answer: unknown; blobs: number }> {
  const page = 200
  let blobs = 0
  let answer: unknown
  for (let at = 0; at < points.length || (at === 0 && more.move); at += page) {
    const part = points.slice(at, at + page)
    const prints = [...new Set(part.flatMap(printsOf))]
    const held = await heldThere(o, { blobs: prints })
    const lacking = prints
      .filter((print) => !held.blobs.has(print))
      .flatMap((print): [string, Uint8Array][] => {
        const bytes = history.blob(print)
        return bytes ? [[print, bytes]] : []
      })
    blobs += await sendBlobs(o, lacking, more.blobsPath)
    const last = at + page >= points.length
    answer = await asked(o, more.path ?? '/_t/sync/points', {
      points: part,
      ...(last && more.move ? { move: more.move } : {}),
    })
    if (last) break
  }
  return { answer, blobs }
}
