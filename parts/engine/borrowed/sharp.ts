import { fetchedModule } from './fetchedModule.ts'

/** The kinds that a picture is written in by the resizer. */
export type PictureFormat = 'avif' | 'webp' | 'png' | 'jpeg' | 'gif'

/** What the engine asks of the resizer. Each throws where the picture breaks it, or passes `points`. */
export interface Resizer {
  /** The picture, turned as it is shown, at most `width` wide and never wider than it is, in a kind. */
  scaled(bytes: Uint8Array, o: { width: number; written: PictureFormat; points: number }): Promise<Uint8Array>
  /** A copy of the picture a few points wide, blurred, as WebP. */
  tiny(bytes: Uint8Array, points: number): Promise<Uint8Array>
}

// The part of the borrowed API that the engine uses, typed here, since its types are not installed.
interface Pipeline {
  rotate(): Pipeline
  resize(o: { width: number; height?: number; fit?: 'inside'; withoutEnlargement?: boolean }): Pipeline
  blur(sigma?: number): Pipeline
  avif(o?: { quality?: number }): Pipeline
  webp(o?: { quality?: number }): Pipeline
  png(o?: object): Pipeline
  jpeg(o?: { quality?: number; mozjpeg?: boolean }): Pipeline
  gif(o?: object): Pipeline
  toBuffer(): Promise<Uint8Array>
}
type Sharp = (input: Uint8Array, o?: { limitInputPixels?: number; failOn?: 'error' }) => Pipeline

// How finely each kind is written: small copies that still look as the picture does.
const writers: Record<PictureFormat, (one: Pipeline) => Pipeline> = {
  avif: (one) => one.avif({ quality: 50 }),
  webp: (one) => one.webp({ quality: 75 }),
  png: (one) => one.png(),
  jpeg: (one) => one.jpeg({ quality: 80, mozjpeg: true }),
  gif: (one) => one.gif(),
}

// The width and the height that a tiny copy fits inside, in points.
const tinySide = 16

/** Loads the resizer from the folder of its part, and answers what the engine asks of it. Throws where the part holds none. */
export async function resizerIn(part: string): Promise<Resizer> {
  const loaded: unknown = await fetchedModule(part, 'sharp')
  const made: unknown = Reflect.get(Object(loaded), 'default') ?? loaded
  if (typeof made !== 'function') throw new Error('The part sharp gives no resizer.')
  // The one place that names the borrowed function by the type written above.
  const sharp = made as Sharp
  const opened = (bytes: Uint8Array, points: number): Pipeline =>
    sharp(bytes, { limitInputPixels: points, failOn: 'error' }).rotate()
  return {
    scaled: (bytes, o) =>
      writers[o.written](opened(bytes, o.points).resize({ width: o.width, withoutEnlargement: true })).toBuffer(),
    tiny: (bytes, points) =>
      opened(bytes, points)
        .resize({ width: tinySide, height: tinySide, fit: 'inside' })
        .blur(1)
        .webp({ quality: 40 })
        .toBuffer(),
  }
}
