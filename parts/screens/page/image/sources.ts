import { named } from '../based.ts'
import type { PageStore } from '../store.ts'

/** The widths that the image door answers, where the project states none of its own. */
const widthsThatShip = [320, 640, 960, 1280, 1920, 2560]

/** The kinds of picture that the image door sends as they are: it scales none of them. */
const asTheyAre = /\.(svg|gif)$/i

/** A source as an `Image` is given it: an asset of the project, the id of a file of the app, or an address. */
export type Source = { asset: string } | { file: string } | { address: string }

/** The form of the id of a file of the app, which is the form of a row's id. */
const fileId = /^[0-9a-hjkmnp-tv-z]{26}$/

/**
 * Takes the `src` of an `Image`, as it was worked out. Answers what it names: text that starts with `https://` or
 * `http://` is an address, an asset is named by `{ asset }`, and other text is the id of a file. Answers nothing for
 * anything else, and for text that has the form of none of them.
 */
export function sourceOf(src: unknown): Source | undefined {
  if (typeof src === 'object' && src !== null && 'asset' in src && typeof src.asset === 'string') {
    return src.asset === '' ? undefined : { asset: src.asset }
  }
  if (typeof src !== 'string') return undefined
  if (/^https?:\/\//i.test(src)) return { address: src }
  return fileId.test(src) ? { file: src } : undefined
}

/** Whether an address is on a host that the project lists: a page loads nothing from any other. */
function listed(address: string, store: PageStore): boolean {
  let origin: string
  try {
    const url = new URL(address)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    origin = url.origin
  } catch {
    return false
  }
  return store.hosts().some((host) => {
    if (host === origin) return true
    // A host written with a star stands for each name under it.
    const star = /^(https?:\/\/)\*\.(.+)$/.exec(host)
    return star !== null && origin.startsWith(star[1]) && origin.endsWith(`.${star[2]}`)
  })
}

/** The key of a picture of the app in the page record: `<id>` for a file and `a/<name>` for an asset. */
export const pictureKey = (source: { asset: string } | { file: string }): string =>
  'asset' in source ? `a/${source.asset}` : source.file

/** What a picture, a recording or a file of timed text is loaded from: its address, and for a picture its widths. */
export interface Loaded {
  src: string
  // The address of each width the image door answers, as `srcset` writes them.
  srcSet?: string
  // In an exported page: the same in each other format it was written in, by its kind, for the browser to pick.
  sources?: { type: string; srcSet: string }[]
  // The picture of the app that it is, for the page record.
  picture?: { asset: string } | { file: string }
  widths?: number[]
}

/**
 * Takes a source, the page, and whether it is a picture. Answers where it is loaded from, or nothing where it may
 * not be: an asset whose name no file of the bundle has, and an address on a host the project does not list. A
 * picture of the app is loaded through the image door, in each width the project names, and an exported page
 * takes the files it was written with.
 */
export function loadedOf(source: Source | undefined, store: PageStore, picture: boolean): Loaded | undefined {
  if (!source) return undefined
  if ('address' in source) return listed(source.address, store) ? { src: source.address } : undefined
  const page = store.page
  const widths = page.imageWidths?.length ? page.imageWidths : widthsThatShip
  if ('asset' in source) {
    const file = store.asset(source.asset)
    if (file === undefined) return undefined
    if (!picture || asTheyAre.test(file)) return { src: file }
    // The fingerprint of an asset stands between its name and its ending: `logo.<fingerprint>.png`.
    const parts = file.slice(file.lastIndexOf('/') + 1).split('.')
    const print = parts.at(source.asset.includes('.') ? -2 : -1) ?? ''
    const door = (width: number): string =>
      named(page, `/_t/img/a/${encodeURIComponent(source.asset)}?w=${width}&v=${encodeURIComponent(print)}`)
    return { src: file, ...widthsIn(door, widths, store, source), picture: source, widths }
  }
  const whole = named(page, `/_t/files/${source.file}`)
  if (!picture) return { src: whole }
  const door = (width: number): string => named(page, `/_t/img/${source.file}?w=${width}`)
  return { src: whole, ...widthsIn(door, widths, store, source), picture: source, widths }
}

/**
 * The widths of a picture as `srcset` writes them: through the image door, or from the files that an exported page
 * was written with, the widest of which is then its address too, since no engine may stand behind it. The door
 * scales a picture down and never up: of the widths at and above the picture's own, where the engine told it, only
 * the first is named, at the picture's own width.
 */
function widthsIn(
  door: (width: number) => string,
  widths: number[],
  store: PageStore,
  source: { asset: string } | { file: string },
): { srcSet: string; src?: string; sources?: { type: string; srcSet: string }[] } {
  const told = store.pictureMet?.(source, widths) ?? store.page.pictures?.[pictureKey(source)]
  const files = told?.files
  const natural = typeof told?.width === 'number' && told.width > 0 ? told.width : undefined
  const above = natural === undefined ? undefined : widths.find((width) => width >= natural)
  const asked = natural === undefined ? widths : widths.filter((width) => width < natural || width === above)
  const each = asked.map(
    (width) =>
      [
        natural !== undefined && width >= natural ? natural : width,
        files?.[width] === undefined ? door(width) : named(store.page, files[width]),
      ] as const,
  )
  const widest = asked.filter((width) => files?.[width] !== undefined).at(-1)
  // A format names the widths it was written in, each as wide as the picture's own file of that width.
  const sources = Object.entries(told?.formats ?? {}).map(([type, paths]) => ({
    type,
    srcSet: asked
      .filter((width) => paths[width] !== undefined)
      .map(
        (width) => `${named(store.page, paths[width])} ${natural !== undefined && width >= natural ? natural : width}w`,
      )
      .join(', '),
  }))
  return {
    ...(sources.length ? { sources } : {}),
    srcSet: each.map(([width, address]) => `${address} ${width}w`).join(', '),
    ...(widest !== undefined && files ? { src: named(store.page, files[widest]) } : {}),
  }
}
