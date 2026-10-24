import type { Caller } from '../../core/index.ts'
import type { DrawInput, Drawn } from '../../screens/draw.ts'
import type { Opened } from '../opened.ts'
import type { Skipped } from './addresses.ts'
import { resizerWaited } from '../pictures/resizer.ts'
import { scaledOf } from '../pictures/scaled.ts'
import { mayDownload } from '../stored/access.ts'
import { fileRow, wholeBytes } from '../stored/files.ts'
import { bytesAt } from '../files.ts'

const nobody: Caller = { kind: 'nobody' }

/** The endings of the kinds of picture, by their kind. */
const endings: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}

/** A picture of the app as an export writes it: its name among the files, its kind, and its bytes. */
interface Written {
  name: string
  kind: string
  bytes(): Promise<Uint8Array>
  fingerprint: string
  width?: number
  height?: number
}

/**
 * Takes an app and a picture of it. Answers it as an export writes it, or nothing where it may not: a file that
 * not everyone may download, and an asset that the bundle does not hold. The name says its source: the id of a
 * file, or `a-` and the name of an asset with each sign but letters, digits, dots and hyphens as `_`.
 */
function writtenOf(o: Opened, src: { asset: string } | { file: string }): Written | undefined {
  if ('file' in src) {
    const file = fileRow(o, src.file)
    if (!file || !mayDownload(o, nobody, file) || endings[file.kind] === undefined) return undefined
    return {
      name: file.id,
      kind: file.kind,
      fingerprint: file.fingerprint,
      bytes: () => wholeBytes(o, file),
      ...(file.width === undefined ? {} : { width: file.width }),
      ...(file.height === undefined ? {} : { height: file.height }),
    }
  }
  const stored: unknown = Object(o.description.assets)[src.asset]
  const path: unknown = Reflect.get(Object(stored), 'file')
  if (typeof path !== 'string' || !path.startsWith('assets/')) return undefined
  const ending = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  const kind = Object.entries(endings).find(([, one]) => one === ending || (ending === 'jpeg' && one === 'jpg'))?.[0]
  if (kind === undefined) return undefined
  const width: unknown = Reflect.get(Object(stored), 'width')
  const height: unknown = Reflect.get(Object(stored), 'height')
  return {
    name: `a-${src.asset.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
    kind,
    // What its copies are kept under: one name of a file, with no folder in it.
    fingerprint: `a.${path.replaceAll('/', '.')}`,
    bytes: async () => new Uint8Array(bytesAt(o.bundle, path)),
    ...(typeof width === 'number' ? { width } : {}),
    ...(typeof height === 'number' ? { height } : {}),
  }
}

/** The path of a picture in one width among the files of an export, in its own kind or in another. */
const pathOf = (written: Written, width: number, kind = written.kind): string =>
  `_t/img/${written.name}.${width}.${endings[kind]}`

/** The files of a picture in each format other than its own kind, by the kind and then by the width. */
export type Formats = Map<string, Record<string, Record<number, string>>>

/** The formats that the project names, `avif` and `webp` where it names none, as the kinds of picture they are. */
function formatsOf(o: Opened): string[] {
  const stated: unknown = Reflect.get(Object(o.description.project.images), 'formats')
  return (Array.isArray(stated) ? stated : ['avif', 'webp'])
    .filter((one) => one === 'avif' || one === 'webp')
    .map((one) => `image/${one}`)
}

/**
 * What an export tells a draw of a picture of the app: the file of each width it is written as, the files in each
 * other format that was written for it, and its tiny copy, for a picture that everyone may see.
 */
export const exportedPicture =
  (o: Opened, formats: Formats = new Map()): DrawInput['picture'] =>
  (src) => {
    const written = writtenOf(o, src)
    if (!written) return undefined
    const widths = Array.isArray(Object(o.description.project.images).widths)
      ? Object(o.description.project.images).widths.filter((one: unknown) => typeof one === 'number')
      : [320, 640, 960, 1280, 1920, 2560]
    const tiny = 'file' in src ? fileRow(o, src.file)?.tiny : undefined
    const others = formats.get(written.name)
    return {
      files: Object.fromEntries(widths.map((width: number) => [width, `/${pathOf(written, width)}`])),
      ...(others && Object.keys(others).length ? { formats: others } : {}),
      ...(tiny === undefined ? {} : { tiny }),
      ...(written.width === undefined ? {} : { width: written.width }),
    }
  }

/**
 * Takes an app, the pictures that the pages of an export met, the files of the export and what it skipped. Adds
 * each picture in each width it may be asked in, scaled down where the resizer is there, and as it is otherwise,
 * and once more in each format of `images.formats` where that copy is smaller; and names in what was skipped,
 * once, each file that a visitor may not download. Answers the files of each picture in the other formats, by its
 * name, which the pages then name.
 */
export async function picturesWritten(
  o: Opened,
  pictures: Drawn['pictures'],
  files: Map<string, string | Uint8Array>,
  skipped: Skipped[],
): Promise<Formats> {
  const refused = new Set<string>()
  const formats: Formats = new Map()
  // An export waits for the resizer, where it may be had, before it scales anything.
  if (pictures.length) await resizerWaited(o)
  for (const { src, widths } of pictures) {
    const written = writtenOf(o, src)
    if ('file' in src && !written && !refused.has(src.file)) {
      const file = fileRow(o, src.file)
      if (file && !mayDownload(o, nobody, file)) {
        refused.add(src.file)
        skipped.push({ what: src.file, why: 'It is a picture that a visitor may not download.' })
      }
    }
    if (!written) continue
    // The widths above the picture's own are one picture: only the first of them is written.
    const natural = written.width
    const above = natural === undefined ? undefined : widths.find((width) => width >= natural)
    for (const width of widths) {
      if (natural !== undefined && width > natural && width !== above) continue
      const path = pathOf(written, width)
      if (files.has(path)) continue
      const scaled = await scaledOf(o, written, width, null).catch(() => undefined)
      files.set(path, scaled && scaled.kind === written.kind ? scaled.bytes : await written.bytes())
      // A copy in a format is written only where the resizer made it smaller than the picture in its own kind.
      for (const kind of formatsOf(o)) {
        if (kind === written.kind) continue
        const other = await scaledOf(o, written, width, kind).catch(() => undefined)
        if (other?.kind !== kind) continue
        files.set(pathOf(written, width, kind), other.bytes)
        const held = formats.get(written.name) ?? {}
        held[kind] = { ...held[kind], [width]: `/${pathOf(written, width, kind)}` }
        formats.set(written.name, held)
      }
    }
  }
  return formats
}
