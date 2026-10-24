// What every byte of a file may be where its kind says nothing.
const bytesKind = 'application/octet-stream'

/** Whether bytes begin with these bytes, at a place. */
const begins = (bytes: Uint8Array, signs: number[], at = 0): boolean =>
  bytes.length >= at + signs.length && signs.every((sign, i) => bytes[at + i] === sign)

/** The letters of bytes, where each is a letter of one byte. */
const lettersOf = (bytes: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...bytes.subarray(from, Math.min(to, bytes.length)))

/** The kind of a packed format, by the entries of the pack that its first bytes name. */
function packedKind(bytes: Uint8Array): string | undefined {
  if (!begins(bytes, [0x50, 0x4b, 0x03, 0x04])) return undefined
  const names = lettersOf(bytes, 0, bytes.length)
  if (names.includes('word/')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (names.includes('xl/')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (names.includes('ppt/')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  return undefined
}

// The brands of a first box that make a file MP4. A brand of the HEIF family names a picture the engine does not
// know by its bytes, as an iPhone writes HEIC, however MP4 its other brands are.
const mp4Brands = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash'])
const heifBrands = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'miaf'])

/** The kind of a file whose first box names it by its brands: MP4 and AVIF, and nothing for a brand of another. */
function boxedKind(bytes: Uint8Array): string | undefined {
  if (lettersOf(bytes, 4, 8) !== 'ftyp') return undefined
  const end = Math.min(bytes.length, Math.max(16, new DataView(bytes.buffer, bytes.byteOffset).getUint32(0)))
  // The major brand, the version, then the brands it is compatible with, four letters each.
  const brands = [lettersOf(bytes, 8, 12)]
  for (let at = 16; at + 4 <= end; at += 4) brands.push(lettersOf(bytes, at, at + 4))
  if (brands.some((brand) => brand === 'avif' || brand === 'avis')) return 'image/avif'
  if (brands.some((brand) => heifBrands.has(brand))) return undefined
  return brands.some((brand) => mp4Brands.has(brand)) ? 'video/mp4' : undefined
}

/** The kind of a text that is HTML or SVG: after a byte-order mark, white space and comments, by its first tag. */
function markedKind(bytes: Uint8Array): string | undefined {
  let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^﻿/, '')
  // White space and comments stand before the first tag of many a page.
  for (;;) {
    const before = text
    text = text.replace(/^\s+/, '').replace(/^<!--[\s\S]*?(-->|$)/, '')
    if (text === before) break
  }
  if (!text.startsWith('<')) return undefined
  if (/^<svg[\s>/]/i.test(text)) return 'image/svg+xml'
  if (/^<\?xml/i.test(text)) {
    const first = /<([a-z][\w:-]*)/i.exec(
      text.replace(/^<\?xml[\s\S]*?\?>/i, '').replace(/<!(?:--[\s\S]*?-->|[^>]*>)/g, ''),
    )
    return first?.[1].toLowerCase() === 'svg' ? 'image/svg+xml' : undefined
  }
  if (/^<!doctype\s+html/i.test(text)) return 'text/html'
  // Any tag of HTML, in any mix of capitals, makes the text HTML: a browser would draw it.
  return /^<[a-z][a-z0-9]*[\s>/]/i.test(text) || /^<[a-z][a-z0-9]*$/i.test(text) ? 'text/html' : undefined
}

/**
 * Takes the first bytes of a file. Answers the kind that the bytes themselves say, or nothing where they say
 * none: PNG, JPEG, GIF, WebP, AVIF, PDF, the packed formats of Word and its like, MP3, MP4, WebM, Ogg and WAV by
 * their first bytes, and HTML and SVG by their first tag.
 */
function kindIn(bytes: Uint8Array): string | undefined {
  if (begins(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (begins(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (lettersOf(bytes, 0, 6) === 'GIF87a' || lettersOf(bytes, 0, 6) === 'GIF89a') return 'image/gif'
  if (lettersOf(bytes, 0, 4) === 'RIFF' && lettersOf(bytes, 8, 12) === 'WEBP') return 'image/webp'
  if (lettersOf(bytes, 0, 4) === 'RIFF' && lettersOf(bytes, 8, 12) === 'WAVE') return 'audio/wav'
  if (lettersOf(bytes, 0, 5) === '%PDF-') return 'application/pdf'
  if (lettersOf(bytes, 0, 4) === 'OggS') return 'audio/ogg'
  if (begins(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm'
  if (
    lettersOf(bytes, 0, 3) === 'ID3' ||
    (bytes[0] === 0xff && bytes.length > 1 && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0)
  )
    return 'audio/mpeg'
  return boxedKind(bytes) ?? packedKind(bytes) ?? markedKind(bytes)
}

// The kinds that the engine knows by the bytes: what a request says of them is not believed.
const known = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
  'text/html',
  'application/pdf',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'video/mp4',
  'video/webm',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

/**
 * Takes the first bytes of a file, and the kind that whoever sent it states. Answers the kind of the file: the one
 * that the bytes say, where they say one. Only where they say nothing is the stated kind kept, without what
 * follows a semicolon: and a stated kind that the engine knows by its bytes, and that the bytes do not bear out,
 * is kept as bytes.
 */
export function kindOf(bytes: Uint8Array, stated: string | undefined): string {
  const said = kindIn(bytes)
  if (said !== undefined) return said
  const kind = (stated ?? '').split(';')[0].trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(kind) || known.has(kind)) return bytesKind
  return kind
}

/** Whether a kind is one of those that a field takes: a kind by its name, or by the word in front of `/*`. */
export function kindFits(kind: string, kinds: unknown): boolean {
  if (!Array.isArray(kinds) || !kinds.length) return true
  return kinds.some(
    (one) => typeof one === 'string' && (one === kind || (one.endsWith('/*') && kind.startsWith(one.slice(0, -1)))),
  )
}

// The kinds that are sent with their kind, to be shown in place. Every other kind is sent as a download.
const inPlace = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'video/mp4',
  'video/webm',
  'application/pdf',
  'text/plain',
])

/** Whether a file of a kind is shown in place, and not sent as a download. */
export const shownInPlace = (kind: string): boolean => inPlace.has(kind)

/** Whether a kind is a picture whose width and height the engine reads. */
export const isPicture = (kind: string): boolean =>
  ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(kind)
