import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { servedBy } from '../versions.ts'

/** One address whose answer the cache may keep, as visitors asked it: its whole address, its origin, how often, and when last. */
interface Asked {
  url: string
  origin: string
  count: number
  at: number
}

// The addresses each app was asked for, by the app over every version, the most it holds of them, and a day.
const asked = new WeakMap<object, Map<string, Asked>>()
const most = 5000
const day = 86_400_000

// The apps whose cache a switch is warming now: what it draws is no asking of a visitor.
const warming = new WeakSet<object>()

/** Notes that a visitor asked an address whose answer the cache may keep. */
export function screenAskedNow(o: Opened, url: URL, origin: string): void {
  if (warming.has(o.handles)) return
  const all = asked.get(o.handles) ?? new Map<string, Asked>()
  asked.set(o.handles, all)
  const held = all.get(url.href) ?? { url: url.href, origin, count: 0, at: 0 }
  held.count++
  held.at = o.clock.now()
  all.delete(url.href)
  all.set(url.href, held)
  if (all.size > most)
    for (const oldest of all.keys()) {
      all.delete(oldest)
      break
    }
}

/** Whether a description holds a screen that states `cache`. */
const caches = (o: Opened): boolean => Object.values(o.description.screens).some((one) => one.cache !== undefined)

/**
 * Takes an app and the version a switch is about to turn its visitors over to. Draws into the cache of that version
 * the addresses that were asked most in the last day and that may be kept, up to `limits.warmPages`, or, with no
 * counts yet, the addresses of the sitemap; within `limits.warmTime`, after which the switch goes on with what it
 * has. A visitor after the switch is answered from a warm cache.
 */
export async function warmFor(o: Opened, version: string): Promise<void> {
  const to = servedBy(o, version)
  if (!to || to === o || o.mode === 'development' || !caches(to)) return
  const ends = performance.now() + storedLimit(o.description, 'warmTime')
  const pages = storedLimit(o.description, 'warmPages')
  const since = o.clock.now() - day
  let chosen = [...(asked.get(o.handles)?.values() ?? [])]
    .filter((one) => one.at >= since)
    .toSorted((a, b) => b.count - a.count)
    .slice(0, pages)
    .map((one) => ({ url: one.url, origin: one.origin }))
  const { pageAnswer } = await import('./answer.ts')
  if (!chosen.length && o.named?.length) {
    const origin = `http://${o.named[0]}`
    const { siteAddresses } = await import('./sitemap.ts')
    chosen = (await siteAddresses(to, origin, { kind: 'nobody' }).catch(() => []))
      .slice(0, pages)
      .map((url) => ({ url, origin }))
  }
  warming.add(o.handles)
  try {
    for (const one of chosen) {
      if (performance.now() > ends) break
      // A page that fails to draw is drawn by its first visitor instead.
      await pageAnswer(to, new URL(one.url), one.origin, { kind: 'nobody' }).catch(() => undefined)
    }
  } finally {
    warming.delete(o.handles)
  }
}
