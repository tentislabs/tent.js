import type { PictureFormat } from '../borrowed/sharp.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import type { Size } from '../../core/internal.ts'
import { sizeOfPicture } from '../../core/internal.ts'
import { cachedCopy } from './cache.ts'
import { resized } from './onThread.ts'
import { resizerFolder, resizerThere } from './resizer.ts'

/** A picture as the resizer is handed it: the fingerprint of its bytes, its kind, its size where it is known, and its bytes. Where no size is known it is read from the bytes. */
export interface Picture {
  fingerprint: string
  kind: string
  width?: number
  height?: number
  bytes(): Promise<Uint8Array>
}

/** What the image door answers in the place of the picture as it is: a copy, its kind, and whether it hangs on `Accept`. */
export interface Scaled {
  bytes: Uint8Array
  kind: string
  vary: boolean
}

// The kind that the resizer writes a picture of each kind in. Any other kind, an SVG among them, is sent as it is.
const writtenAs: Record<string, PictureFormat> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

/** Whether a GIF holds more than one picture, by the blocks that its pictures begin with: a moving one is sent as it is. */
function moving(bytes: Uint8Array): boolean {
  if (Buffer.from(bytes.subarray(0, 3)).toString('latin1') !== 'GIF') return false
  if (Buffer.from(bytes).includes('NETSCAPE2.0', 0, 'latin1')) return true
  let frames = 0
  for (let at = 0; at + 1 < bytes.length; at++) if (bytes[at] === 0x21 && bytes[at + 1] === 0xf9) frames++
  return frames > 1
}

/** The formats that the project names and that the browser says it takes, in the order of the project. */
function offered(o: Opened, accept: string | null): PictureFormat[] {
  const stated: unknown = Reflect.get(Object(o.description.project.images), 'formats')
  const formats = (Array.isArray(stated) ? stated : ['avif', 'webp']).filter(
    (one): one is PictureFormat => one === 'avif' || one === 'webp',
  )
  const takes = (accept ?? '').toLowerCase()
  return formats.filter((one) => takes.includes(`image/${one}`))
}

/** The kind that a picture is written in where it is held to the bounds of the image door: one picture, of few enough points. */
function bounded(o: Opened, picture: Picture, bytes: Uint8Array): { own: PictureFormat; size: Size } | undefined {
  const own = writtenAs[picture.kind]
  if (own === undefined || moving(bytes)) return undefined
  const size =
    picture.width !== undefined && picture.height !== undefined
      ? { width: picture.width, height: picture.height }
      : sizeOfPicture(picture.kind, bytes)
  if (!size || size.width * size.height > storedLimit(o.description, 'imagePoints')) return undefined
  return { own, size }
}

/**
 * Takes an app, a picture, the width that the door was asked for, and the `Accept` line of the browser. Answers
 * the picture scaled down to the width, never up, in the first format that the project names and the browser
 * takes where that copy is smaller than the one in the picture's own kind, and in its own kind otherwise. Answers
 * nothing where the picture is sent as it is: while the resizer is not there, whose fetch it then starts; for an
 * SVG, a moving GIF and a picture of more than `limits.imagePoints`; and where the resizer breaks or passes
 * `limits.imageTime`. Each copy is kept in `cache/img/`.
 */
export async function scaledOf(
  o: Opened,
  picture: Picture,
  width: number,
  accept: string | null,
): Promise<Scaled | undefined> {
  // What the bounds refuse by what is known of the picture starts no fetch.
  const known = (picture.width ?? 0) * (picture.height ?? 0)
  if (writtenAs[picture.kind] === undefined || known > storedLimit(o.description, 'imagePoints')) return undefined
  const part = resizerFolder(o)
  if (part === undefined) return undefined
  const bytes = await picture.bytes()
  const held = bounded(o, picture, bytes)
  if (held === undefined) return undefined
  const { own, size } = held
  const [points, ms] = [storedLimit(o.description, 'imagePoints'), storedLimit(o.description, 'imageTime')]
  const copy = (written: PictureFormat): Promise<Uint8Array> =>
    cachedCopy(o, `${picture.fingerprint}.${width}.${written}`, () =>
      resized(part, bytes, { width, written, points }, ms),
    )
  const formats = offered(o, accept)
  const vary = offered(o, 'image/avif,image/webp').length > 0
  try {
    // A picture that is no wider than the width is in its own kind as it is.
    const plain = size.width <= width ? bytes : await copy(own)
    const [first] = formats
    if (first !== undefined && first !== own) {
      const other = await copy(first).catch(() => undefined)
      if (other !== undefined && other.byteLength < plain.byteLength)
        return { bytes: other, kind: `image/${first}`, vary }
    }
    return { bytes: plain, kind: picture.kind, vary }
  } catch {
    // A picture that breaks the resizer, or takes longer than its time, is sent as it is.
    return undefined
  }
}

/**
 * Takes an app and a picture that was just uploaded. Answers its tiny blurred copy, as a text of a data address
 * under 1 kB, where the resizer is there already and the picture is held to the bounds of the image door, and
 * nothing otherwise: nothing is fetched for it, and a picture that breaks the resizer has none.
 */
export async function tinyOf(o: Opened, picture: Picture): Promise<string | undefined> {
  const part = resizerThere(o)
  if (part === undefined || writtenAs[picture.kind] === undefined) return undefined
  const bytes = await picture.bytes()
  if (bounded(o, picture, bytes) === undefined) return undefined
  const points = storedLimit(o.description, 'imagePoints')
  try {
    const made = await resized(part, bytes, { points }, storedLimit(o.description, 'imageTime'))
    const text = `data:image/webp;base64,${Buffer.from(made).toString('base64')}`
    return text.length < 1024 ? text : undefined
  } catch {
    return undefined
  }
}
