import { TentError } from '../../core/index.ts'
import type { App, ServedRequest } from '../../engine/index.ts'
import type { History, Point } from '../../history/index.ts'
import { blobsBody, blobsOf, blobsType } from '../blobsBody.ts'
import { idsAtOnce, syncLimit } from '../limits.ts'
import type { Loose } from './loose.ts'
import { mergedOnServer, refusedPush } from './merged.ts'
import { bundleOf } from './versions.ts'
import { comesFrom, leadingTo } from './walk.ts'

/** An answer in the wire form. */
const ok = (value: unknown): Response =>
  new Response(JSON.stringify({ ok: true, value }), { headers: { 'content-type': 'application/json' } })

/** The failure of a key that holds none of the rights a part of an address asks for: T9104. */
const noRight = (what: string, rights: string[]): TentError =>
  new TentError('T9104', `${what} needs a key with the right ${rights.map((one) => `\`${one}\``).join(' or ')}.`, {
    fields: { right: rights.join(',') },
    fix: 'Make a key with that right on the server, with `tent access key add <name> --right <right>`.',
  })

/** Holds a key to the rights a part of an address asks for. Throws T9104 where it holds none of them. */
function needs(key: ServedRequest['key'], what: string, rights: string[]): void {
  if (!rights.some((one) => key.rights.includes(one))) throw noRight(what, rights)
}

/** A list of ids of a body, a thousand at most. Throws T0002 for more, and for one that is no list of texts. */
function idsOf(body: object, name: string): string[] {
  const ids: unknown = Reflect.get(body, name)
  if (ids === undefined) return []
  if (!Array.isArray(ids) || ids.some((one) => typeof one !== 'string'))
    throw new TentError('T0002', `\`${name}\` is a list of ids.`, { fields: { [name]: 'type' } })
  if (ids.length > idsAtOnce)
    throw new TentError('T0002', `\`${name}\` names ${ids.length} ids, and one request names ${idsAtOnce} at most.`, {
      fields: { [name]: 'max' },
    })
  return ids
}

/** The JSON body of a request. Throws T0002 for a body that is no record. */
async function jsonOf(request: Request): Promise<Record<string, unknown>> {
  let read: unknown
  try {
    read = await request.json()
  } catch {
    read = undefined
  }
  if (typeof read !== 'object' || read === null || Array.isArray(read))
    throw new TentError('T0002', 'The body is a record in the wire form.', { fields: { body: 'type' } })
  return Object(read)
}

/** What a server answers of its history and its app, for the addresses of `/_t/sync`. */
export interface SyncServer {
  app: App
  history: History
  loose: Loose
  // The pointers a program of its own keeps besides the branches, with what `have` answers of each.
  pointers(rights: string[]): Record<string, unknown>
  // Told when a push moved a branch, and where it stands now.
  moved?(pointer: string, point: string): Promise<void>
}

// Names that a push may not move: those the history keeps for itself.
const kept = /^(now|on|live)$|^(at|seen|made):|[/\s:]/

/** What is live on a server: its point, its version, the files of its bundle by path, and its description. */
function liveOf(history: History): {
  live?: { point: string; version: string; files: Record<string, string>; description?: string }
} {
  const point = history.pointer('live')
  const published = point === undefined ? undefined : history.read(point)
  const version = published?.name
  if (!published || version === undefined) return {}
  return {
    live: {
      point: published.id,
      version,
      files: bundleOf(history, version) ?? {},
      ...(published.description ? { description: published.description } : {}),
    },
  }
}

/** Pushes to one pointer are merged one at a time, in the order they arrived. */
const queues = new WeakMap<History, Map<string, Promise<unknown>>>()
function inTurn<Answer>(history: History, pointer: string, work: () => Promise<Answer>): Promise<Answer> {
  const queue = queues.get(history) ?? new Map<string, Promise<unknown>>()
  queues.set(history, queue)
  const next = (queue.get(pointer) ?? Promise.resolve()).catch(() => undefined).then(work)
  queue.set(pointer, next)
  return next
}

/**
 * Moves a branch of the server where it still stands where the pusher last saw it, and where the pushed point
 * comes from it; merges where it does not. Answers the point it stands on now. Throws T9103 for a name the history
 * keeps for itself, and what the merge refuses with.
 */
async function moved(history: History, move: Record<string, unknown>): Promise<string> {
  const [pointer, to, was] = [move.pointer, move.to, move.was]
  if (typeof pointer !== 'string' || pointer === '' || kept.test(pointer) || typeof to !== 'string')
    throw refusedPush(
      `A push may not move \`${String(pointer).slice(0, 80)}\`.`,
      { reason: 'pointer' },
      'Push a branch.',
    )
  if (!history.read(to)) throw new TentError('T9107', `The server holds no point ${to}.`, { fields: { point: to } })
  return inTurn(history, pointer, async () => {
    const standing = history.pointer(pointer)
    const saw = typeof was === 'string' ? was : undefined
    if (standing === undefined || (standing === saw && comesFrom(history, to, standing))) {
      history.move(pointer, to)
      return to
    }
    if (standing === to || comesFrom(history, standing, to)) return standing
    const point = await mergedOnServer(history, pointer, saw, standing, to)
    return point
  })
}

/**
 * Answers a request to an address of `/_t/sync`: `have` names which points and blobs the server holds, `blobs`
 * takes and answers bytes, and `points` takes and answers points, moving a branch with `move`.
 */
export async function syncAnswer(server: SyncServer, asked: ServedRequest): Promise<Response> {
  const { request, key } = asked
  const { history, app } = server
  const path = new URL(request.url).pathname
  if (path === '/_t/sync/have') {
    const body = await jsonOf(request)
    const held = history.have({ points: idsOf(body, 'points'), blobs: idsOf(body, 'blobs') })
    return ok(
      body.pointers === true
        ? { ...held, pointers: server.pointers(key.rights), mode: asked.mode, ...liveOf(history) }
        : held,
    )
  }
  if (path === '/_t/sync/blobs' && (request.headers.get('content-type') ?? '').startsWith(blobsType)) {
    // The files of a bundle are sent by a key of `publish`, as large as `syncFileSize`, and are no loose blobs.
    const bundled = new URL(request.url).searchParams.get('for') === 'bundle'
    needs(key, 'Sending blobs', bundled ? ['publish'] : ['push', 'publish'])
    const bytes = new Uint8Array(await request.arrayBuffer())
    const blobs = blobsOf(bytes)
    const most = syncLimit(app.description, 'syncSize')
    if (blobs.length > 1 && bytes.length > most)
      throw new TentError('T0003', `Blobs that together pass ${most} bytes travel one to a request.`)
    const limit = syncLimit(app.description, bundled ? 'syncFileSize' : 'historyFileSize')
    for (const [print, one] of blobs)
      if (one.length > limit)
        throw new TentError('T0003', `The blob ${print} is larger than ${limit} bytes, the most it may be.`)
    if (!bundled) server.loose.add(app, blobs)
    history.take({ blobs: Object.fromEntries(blobs) })
    return ok({ taken: blobs.length })
  }
  if (path === '/_t/sync/blobs') {
    const want = idsOf(await jsonOf(request), 'want')
    // `bundle` fetches the files of what is live and nothing else, and `publish` the description that is live too.
    if (!['read', 'copy', 'far'].some((one) => key.rights.includes(one))) {
      const live = liveOf(history).live
      const open = new Set([
        ...(key.rights.includes('bundle') ? Object.values(live?.files ?? {}) : []),
        ...(key.rights.includes('publish') && live?.description ? [live.description] : []),
      ])
      if (!open.size || want.some((print) => !open.has(print))) needs(key, 'Fetching blobs', ['read', 'copy', 'far'])
    }
    const most = syncLimit(app.description, 'syncSize')
    const sent: [string, Uint8Array][] = []
    let size = 0
    for (const print of want) {
      const bytes = history.blob(print)
      if (!bytes) continue
      if (sent.length && size + bytes.length > most) break
      sent.push([print, bytes])
      size += bytes.length
    }
    return new Response(blobsBody(sent), { headers: { 'content-type': blobsType } })
  }
  if (path === '/_t/sync/points') {
    const body = await jsonOf(request)
    if (Array.isArray(body.points)) {
      needs(key, 'Sending points', ['push', 'publish'])
      const points: Point[] = body.points
      history.take({ points })
      // What frees the count is what the server's own points name: a point it held already, sent again with other
      // files, names nothing new.
      server.loose.named(
        points.flatMap((one) => {
          const held = typeof Reflect.get(Object(one), 'id') === 'string' ? history.read(one.id) : undefined
          return held ? [held] : []
        }),
      )
      const move = body.move
      if (typeof move !== 'object' || move === null) return ok({ taken: points.length })
      needs(key, 'Moving a branch', ['push'])
      const point = await moved(history, Object(move))
      await server.moved?.(String(Reflect.get(Object(move), 'pointer')), point)
      return ok({ point })
    }
    needs(key, 'Fetching points', ['read', 'copy', 'far'])
    const from = typeof body.from === 'string' ? body.from : ''
    const head = history.pointer(from) ?? history.read(from)?.id
    if (head === undefined) return ok({ points: [] })
    const all = leadingTo(history, head, new Set(idsOf(body, 'have')))
    const after = typeof body.after === 'string' ? all.findIndex((one) => one.id === body.after) + 1 : 0
    const most = syncLimit(app.description, 'syncSize') / 2
    const page: Point[] = []
    let size = 0
    for (const point of all.slice(after)) {
      const length = JSON.stringify(point).length
      if (page.length && size + length > most) break
      page.push(point)
      size += length
    }
    const last = page.at(-1)
    const more = last !== undefined && all.indexOf(last) < all.length - 1
    return ok({ head, points: page, ...(more ? { next: last.id } : {}) })
  }
  throw new TentError('T0001', `Nothing answers ${path}.`)
}
