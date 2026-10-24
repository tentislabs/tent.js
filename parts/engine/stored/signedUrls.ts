import { later, TentError } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { sealedAt } from '../values/seal.ts'
import type { StoredFile } from './files.ts'

// What the text of a signed address is bound to: a text made for one file opens for no other.
const boundTo = (file: string): string => `_t_files.link.${file}`

/**
 * Takes an app, a file that the caller may download now, how long the address lasts in words, as `'1 hour'`, and
 * who makes it. Answers a signed address for a time, `/_t/files/<id>?l=<text>`: the text is sealed under the key
 * of the app, so only the engine can read it, and it names the file, the end and the caller who made it. Throws
 * T0002 for words that are no length of time, and T0019 where the app holds no key.
 */
export function signedUrlTo(o: Opened, file: StoredFile, lasts: unknown, by: string): string {
  const now = o.clock.now()
  let ends: number
  try {
    ends = later(new Date(now), String(lasts)).getTime()
  } catch {
    ends = Number.NaN
  }
  if (typeof lasts !== 'string' || !Number.isFinite(ends) || ends <= now)
    throw new TentError('T0002', '`for` of `files.signedUrl` is a length of time, as `1 hour`.', {
      fields: { for: 'pattern' },
    })
  const { seal } = sealedAt(o.dataFolder)
  if (!seal)
    throw new TentError('T0019', 'A signed address is sealed under the key of the app, and none is at hand.', {
      fix: 'Give the engine its key, as `TENT_SECRET_KEY` or as `secret.key` of its data folder.',
    })
  const text = seal.close({ file: file.id, ends, by }, boundTo(file.id))
  return `/_t/files/${file.id}?l=${text}`
}

/**
 * Takes an app, a file that stands, and the text of a signed address. Answers whether the address opens the file
 * now: it was made for this file under the key of the app, and its end has not come. A removed file is never handed
 * here.
 */
export function signedUrlOpens(o: Opened, file: StoredFile, text: string): boolean {
  const { seal } = sealedAt(o.dataFolder)
  if (!seal || !/^[A-Za-z0-9_-]{1,2000}$/.test(text)) return false
  let held: unknown
  try {
    held = seal.open(text, boundTo(file.id))
  } catch {
    return false
  }
  const ends: unknown = Reflect.get(Object(held), 'ends')
  return Reflect.get(Object(held), 'file') === file.id && typeof ends === 'number' && o.clock.now() < ends
}
