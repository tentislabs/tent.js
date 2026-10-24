/** The width and the height of a picture, as it is shown. */
export interface Size {
  width: number
  height: number
}

const view = (bytes: Uint8Array): DataView => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

const letters = (bytes: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...bytes.subarray(from, Math.min(to, bytes.length)))

/** Where the letters of a name first stand in the bytes, or -1: a picture is too long to be made into one text. */
function placeOf(bytes: Uint8Array, name: string): number {
  const wanted = [...name].map((letter) => letter.charCodeAt(0))
  for (
    let at = bytes.indexOf(wanted[0]);
    at >= 0 && at + wanted.length <= bytes.length;
    at = bytes.indexOf(wanted[0], at + 1)
  )
    if (wanted.every((one, i) => bytes[at + i] === one)) return at
  return -1
}

function png(bytes: Uint8Array): Size | undefined {
  if (bytes.length < 24 || letters(bytes, 12, 16) !== 'IHDR') return undefined
  return { width: view(bytes).getUint32(16), height: view(bytes).getUint32(20) }
}

function gif(bytes: Uint8Array): Size | undefined {
  if (bytes.length < 10) return undefined
  return { width: view(bytes).getUint16(6, true), height: view(bytes).getUint16(8, true) }
}

/** How a photo is marked as turned, read from the part of a JPEG that a camera writes: 5 to 8 lie on their side. */
function turnOf(bytes: Uint8Array, at: number, length: number): number {
  if (letters(bytes, at, at + 6) !== 'Exif\0\0') return 1
  const start = at + 6
  if (start + 8 > bytes.length) return 1
  const little = letters(bytes, start, start + 2) === 'II'
  const data = view(bytes)
  const first = start + data.getUint32(start + 4, little)
  if (first + 2 > at + length || first + 2 > bytes.length) return 1
  const entries = data.getUint16(first, little)
  for (let i = 0; i < entries; i++) {
    const entry = first + 2 + i * 12
    if (entry + 12 > bytes.length) return 1
    if (data.getUint16(entry, little) === 0x0112) return data.getUint16(entry + 8, little)
  }
  return 1
}

function jpeg(bytes: Uint8Array): Size | undefined {
  const data = view(bytes)
  let [at, turn] = [2, 1]
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return undefined
    const mark = bytes[at + 1]
    const length = data.getUint16(at + 2)
    if (mark === 0xe1) turn = turnOf(bytes, at + 4, length - 2)
    // The frame that states the size: every one of its kinds but the tables that share its numbers.
    if (mark >= 0xc0 && mark <= 0xcf && mark !== 0xc4 && mark !== 0xc8 && mark !== 0xcc) {
      if (at + 9 > bytes.length) return undefined
      const [height, width] = [data.getUint16(at + 5), data.getUint16(at + 7)]
      return turn >= 5 && turn <= 8 ? { width: height, height: width } : { width, height }
    }
    at += 2 + length
  }
  return undefined
}

function webp(bytes: Uint8Array): Size | undefined {
  if (bytes.length < 30) return undefined
  const data = view(bytes)
  const form = letters(bytes, 12, 16)
  if (form === 'VP8X') {
    const wide = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16))
    const high = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
    return { width: wide, height: high }
  }
  if (form === 'VP8 ') return { width: data.getUint16(26, true) & 0x3fff, height: data.getUint16(28, true) & 0x3fff }
  if (form === 'VP8L') {
    const bits = data.getUint32(21, true)
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
  }
  return undefined
}

/** The size that an AVIF picture states in its `ispe` box, turned where an `irot` box says that it lies on its side. */
function avif(bytes: Uint8Array): Size | undefined {
  const at = placeOf(bytes, 'ispe')
  if (at < 0 || at + 16 > bytes.length) return undefined
  const [width, height] = [view(bytes).getUint32(at + 8), view(bytes).getUint32(at + 12)]
  const turned = placeOf(bytes, 'irot')
  const side = turned >= 0 && turned + 5 <= bytes.length && (bytes[turned + 4] & 1) === 1
  return side ? { width: height, height: width } : { width, height }
}

const readers: Record<string, (bytes: Uint8Array) => Size | undefined> = {
  'image/png': png,
  'image/gif': gif,
  'image/jpeg': jpeg,
  'image/webp': webp,
  'image/avif': avif,
}

/**
 * Takes the kind of a file and its first bytes. Answers the width and the height of a picture as it is shown, a
 * photo that is marked as turned counted as turned, or nothing for a file that is no picture and for bytes that
 * state no size.
 */
export function sizeOfPicture(kind: string, bytes: Uint8Array): Size | undefined {
  const size = Object.hasOwn(readers, kind) ? readers[kind](bytes) : undefined
  return size && size.width > 0 && size.height > 0 ? size : undefined
}
