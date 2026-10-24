import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../../core/index.ts'
import { fingerprintOf, isPath, isStored } from '../../core/internal.ts'
import type { Address } from '../door/address.ts'
import { countedFor } from '../door/rate.ts'
import { limitOf, storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { cacheKey, cacheOf } from '../pages/cache.ts'
import { stateOf } from '../pages/find.ts'
import { screenNamedAt } from '../pages/named.ts'
import { errorAnswer } from '../wire.ts'

const prefix = '/_t/seo/image/'

/** Every answer of the address can never act as a page of the app. */
const locked = { 'content-security-policy': "default-src 'none'; sandbox", 'x-content-type-options': 'nosniff' }

/** The answer for an address that holds no picture: the same for every reason, and nothing is drawn. */
const none = (): Response => new Response('', { status: 404, headers: locked })

// The drawing of each app that is under way: one picture at a time, so that a flood waits and never fills the browser.
const drawing = new WeakMap<object, Promise<unknown>>()

/** The component that the `seo.image` of the screen of a name draws, with its size, where it is open to anyone. */
function pictureOf(o: Opened, name: string): { view: string; size: [number, number] } | undefined {
  const screen = Object.hasOwn(o.description.screens, name) ? o.description.screens[name] : undefined
  const preview: unknown = Reflect.get(Object(screen?.seo), 'image')
  if (!isStored(preview) || typeof preview.view !== 'string' || Object(screen?.access).rule !== 'anyone')
    return undefined
  const size = Array.isArray(preview.size) && preview.size.length === 2 ? preview.size.map(Number) : [1200, 630]
  return { view: preview.view, size: [size[0] ?? 1200, size[1] ?? 630] }
}

/** A short fingerprint of a text, as the name of a picture holds it. */
const short = (text: string, length: number): string => fingerprintOf(new TextEncoder().encode(text)).slice(0, length)

/**
 * Takes the folder of the pictures, the version that runs, and the screen whose picture was just kept. Drops what
 * the engine drops of the answers of a screen: the pictures of another version, those of the screen past
 * `limits.pageCachePerScreen`, and all past `limits.pageCacheSize`, the oldest first.
 */
function dropPast(o: Opened, folder: string, version: string, screen: string): void {
  const files = readdirSync(folder).flatMap((file) => {
    try {
      const held = statSync(join(folder, file))
      return [{ file, at: held.mtimeMs, size: held.size }]
    } catch {
      return []
    }
  })
  const gone = (file: string): void => rmSync(join(folder, file), { force: true })
  for (const one of files) if (!one.file.startsWith(`${version}.`)) gone(one.file)
  const kept = files.filter((one) => one.file.startsWith(`${version}.`))
  kept.sort((a, b) => a.at - b.at)
  const ofScreen = kept.filter((one) => one.file.startsWith(`${version}.${screen}.`))
  const perScreen = limitOf(o.description, 'pageCachePerScreen')
  const past = new Set(ofScreen.slice(0, Math.max(0, ofScreen.length - perScreen)).map((one) => one.file))
  let total = 0
  for (const one of kept) if (!past.has(one.file)) total += one.size
  const most = limitOf(o.description, 'pageCacheSize')
  for (const one of kept) {
    if (past.has(one.file)) gone(one.file)
    else if (total > most) {
      gone(one.file)
      total -= one.size
    }
  }
}

/**
 * `GET /_t/seo/image/<screen>?<an address of it>`: the picture of that address for the links to it that are shared.
 * The component that the screen's `seo.image` names is drawn as nobody, handed the answers of the address, in the hidden browser of `tent
 * shot`, into a PNG of its size, and kept by the mark of those answers, so it is drawn again only when one of them
 * changes; at most `limits.seoImagesPerMinute` drawings a minute for the app, one at a time. A screen with no
 * picture, one not open to anyone, and an address that the screen does not hold answer 404 and draw nothing. It
 * passes steps 1, 2 and 4 of the door, as nobody: no way of telling who calls is asked.
 */
export const address: Address = {
  order: 1,
  match(request) {
    const { pathname } = new URL(request.url)
    return (request.method === 'GET' || request.method === 'HEAD') && pathname.startsWith(prefix) && { pathname }
  },
  steps: [1, 2, 4],
  async handle({ app, request, about }) {
    const url = new URL(request.url)
    let name: string
    let asked: string
    try {
      name = decodeURIComponent(url.pathname.slice(prefix.length))
      asked = decodeURIComponent(url.search.slice(1))
    } catch {
      return none()
    }
    const preview = pictureOf(app, name)
    const path = asked.split('?')[0]
    if (!preview || !isPath(path) || asked.startsWith('//') || screenNamedAt(app.description, path) !== name)
      return none()
    try {
      const { pageAnswer } = await import('../pages/answer.ts')
      const at = new URL(asked, about.origin)
      const drawn = await pageAnswer(app, at, about.origin, { kind: 'nobody' }, about.from, false, null, {
        preview: { component: preview.view, size: preview.size },
      })
      if (drawn.status !== 200 || !drawn.preview) return none()
      const folder = join(app.dataFolder, 'seoImages')
      // A picture is kept as an answer of its screen is: by the values of the screen's address alone, so that a
      // name that is no state of it is no part of the key, and not at all for a state of many values not at its
      // default; dropped when the screen's cache time is up, where it states one, and once what it read changed.
      const screen = app.description.screens[name]
      const state = {
        ...stateOf(app.description.project.state, at.searchParams),
        ...stateOf(screen?.state, at.searchParams),
      }
      const key = cacheKey(app.description, name, '', '', at.pathname, state)
      const version = short(app.version, 8)
      const named = `${version}.${short(name, 8)}.${key === undefined ? `once-${short(`${asked} ${Math.random()}`, 16)}` : short(key, 24)}`
      const mark = short(`${app.version} ${drawn.preview.mark}`, 16)
      const file = join(folder, `${named}.${mark}.png`)
      const lasts = isStored(screen) ? cacheOf(screen)?.for : undefined
      const kept = (): Uint8Array<ArrayBuffer> | undefined => {
        try {
          if (lasts !== undefined && app.clock.now() - statSync(file).mtimeMs > lasts) return undefined
          return new Uint8Array(readFileSync(file))
        } catch {
          return undefined
        }
      }
      let bytes: Uint8Array<ArrayBuffer> | undefined = kept()
      if (!bytes) {
        const before = drawing.get(app.handles) ?? Promise.resolve()
        const made = before.then(async (): Promise<Uint8Array<ArrayBuffer>> => {
          // A request that waited may find the picture drawn by the one before it.
          const found = kept()
          if (found) return found
          const limit = storedLimit(app.description, 'seoImagesPerMinute')
          if (!countedFor(app, 'seoImages', limit))
            throw new TentError('T0005', `More than ${limit} pictures for shared links were drawn in a minute.`, {
              fix: 'Ask again in a minute, or raise `seoImagesPerMinute` in `project.limits`.',
            })
          mkdirSync(folder, { recursive: true })
          const { shotOf } = await import('../shot/shot.ts')
          await shotOf(app, `${at.pathname}${at.search}`, {
            size: { width: preview.size[0], height: preview.size[1] },
            document: drawn.html,
            out: file,
          })
          // What this request drew is answered whatever its age: the hidden browser ends after the file is written,
          // which may take longer than the screen's cache lasts.
          const drawnNow = new Uint8Array(readFileSync(file))
          // The pictures of the address that were drawn from other answers are kept no longer.
          for (const old of readdirSync(folder))
            if (old.startsWith(`${named}.`) && old !== `${named}.${mark}.png`)
              rmSync(join(folder, old), { force: true })
          dropPast(app, folder, version, short(name, 8))
          return drawnNow
        })
        drawing.set(
          app.handles,
          made.catch(() => undefined),
        )
        bytes = await made
        // A picture that no key holds is answered once and kept no longer.
        if (key === undefined) rmSync(file, { force: true })
      }
      if (!bytes) return none()
      const etag = `"${mark}"`
      const headers = { ...locked, 'content-type': 'image/png', 'cache-control': 'public, no-cache', etag }
      if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
      return new Response(request.method === 'HEAD' ? null : bytes, { status: 200, headers })
    } catch (error) {
      return errorAnswer(app, prefix, error)
    }
  },
}
