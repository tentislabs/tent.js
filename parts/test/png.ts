import { crc32, inflateSync } from 'node:zlib'
import { TentError } from '../core/index.ts'

/** A picture: its size, and for each pixel four numbers of 0 to 255, which are red, green, blue and how solid it is. */
export type Picture = { width: number; height: number; pixels: Uint8Array }

const signature = [137, 80, 78, 71, 13, 10, 26, 10]

/** The error of bytes that are no PNG file this reads, with why. */
const unread = (why: string): TentError =>
  new TentError('T0002', `The picture cannot be read: ${why}.`, {
    fix: 'Hand the bytes of a PNG file, as a browser takes its pictures.',
  })
// The numbers that one pixel holds in the file, by the kind of colour that the head of the file states.
const numbersOf: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

type Head = { width: number; height: number; depth: number; kind: number }
type Chunks = { head: Head; palette: Uint8Array; clear: Uint8Array; packed: Uint8Array }

/** Cuts a file into its pieces, and holds the check number of each. */
function chunksOf(bytes: Uint8Array): Chunks {
  if (signature.some((byte, k) => bytes[k] !== byte)) throw unread('the bytes are no PNG file')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let head: Head | undefined
  let palette: Uint8Array = new Uint8Array()
  let clear: Uint8Array = new Uint8Array()
  const packed: Uint8Array[] = []
  for (let at = signature.length; at + 12 <= bytes.length; ) {
    const length = view.getUint32(at)
    const name = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    const data = bytes.subarray(at + 8, at + 8 + length)
    if (
      at + 12 + length > bytes.length ||
      crc32(bytes.subarray(at + 4, at + 8 + length)) !== view.getUint32(at + 8 + length)
    )
      throw unread(`the PNG file is broken in its piece ${name}`)
    if (name === 'IHDR') {
      if (view.getUint8(at + 20) !== 0)
        throw unread('the reader of PNG files reads no picture that is laid out in passes')
      head = { width: view.getUint32(at + 8), height: view.getUint32(at + 12), depth: data[8], kind: data[9] }
    } else if (name === 'PLTE') palette = data
    else if (name === 'tRNS') clear = data
    else if (name === 'IDAT') packed.push(data)
    else if (name === 'IEND') break
    at += 12 + length
  }
  if (!head || !numbersOf[head.kind]) throw unread('the PNG file has no head that the reader knows')
  return { head, palette, clear, packed: Buffer.concat(packed) }
}

/** Takes the filter of each line off, in place, and answers the lines without the byte that names the filter. */
function plain(lines: Uint8Array, height: number, stride: number, step: number): Uint8Array {
  const out = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = lines[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const left = x >= step ? out[y * stride + x - step] : 0
      const up = y ? out[(y - 1) * stride + x] : 0
      const upLeft = y && x >= step ? out[(y - 1) * stride + x - step] : 0
      const nearest = () => {
        const [a, b, c] = [Math.abs(up - upLeft), Math.abs(left - upLeft), Math.abs(left + up - 2 * upLeft)]
        return a <= b && a <= c ? left : b <= c ? up : upLeft
      }
      const add = [0, left, up, (left + up) >> 1, filter === 4 ? nearest() : 0][filter]
      if (add === undefined)
        throw unread(`the PNG file has a line with the filter ${filter}, which the reader does not know`)
      out[y * stride + x] = lines[y * (stride + 1) + 1 + x] + add
    }
  }
  return out
}

/**
 * Reads a PNG file. Takes its bytes, and answers the picture with four numbers of 0 to 255 for each pixel. Throws
 * T0002 on bytes that are no PNG file, on a file that is broken, and on a picture that is laid out in passes.
 */
export function readPng(bytes: Uint8Array): Picture {
  const { head, palette, clear, packed } = chunksOf(bytes)
  const { width, height, depth, kind } = head
  const numbers = numbersOf[kind]
  const stride = Math.ceil((width * numbers * depth) / 8)
  const lines = plain(inflateSync(packed), height, stride, Math.max(1, (numbers * depth) / 8))
  const most = 2 ** depth - 1
  // One number of a pixel as the file holds it: a line packs numbers of fewer than eight bits, and splits one of sixteen.
  const raw = (y: number, k: number): number => {
    if (depth === 16) return (lines[y * stride + k * 2] << 8) | lines[y * stride + k * 2 + 1]
    if (depth === 8) return lines[y * stride + k]
    return (lines[y * stride + ((k * depth) >> 3)] >> (8 - depth - ((k * depth) & 7))) & most
  }
  const to255 = (value: number) => Math.round((value * 255) / most)
  // A file with no clearness of its own may name one colour that is wholly clear, by its numbers as the file holds them.
  const clearOne = (k: number) => (clear[k * 2] << 8) | clear[k * 2 + 1]
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = x * numbers
      let pixel: number[]
      if (kind === 3) {
        const index = raw(y, at)
        pixel = [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2], clear[index] ?? 255]
      } else if (kind === 0 || kind === 4) {
        const grey = raw(y, at)
        const solid = kind === 4 ? to255(raw(y, at + 1)) : clear.length >= 2 && clearOne(0) === grey ? 0 : 255
        pixel = [to255(grey), to255(grey), to255(grey), solid]
      } else {
        const [red, green, blue] = [raw(y, at), raw(y, at + 1), raw(y, at + 2)]
        const isClear = clear.length >= 6 && clearOne(0) === red && clearOne(1) === green && clearOne(2) === blue
        const solid = kind === 6 ? to255(raw(y, at + 3)) : isClear ? 0 : 255
        pixel = [to255(red), to255(green), to255(blue), solid]
      }
      pixels.set(pixel, (y * width + x) * 4)
    }
  return { width, height, pixels }
}

/**
 * Takes two pictures. Answers how many of their pixels differ, of how many, and that share from 0 to 1: a pixel
 * differs where one of its four numbers differs by more than 8 of 255, and two pictures of other sizes differ wholly.
 */
export function differing(one: Picture, other: Picture): { count: number; all: number; share: number } {
  const all = one.width * one.height
  if (one.width !== other.width || one.height !== other.height) return { count: all, all, share: 1 }
  let count = 0
  for (let at = 0; at < one.pixels.length; at += 4)
    if ([0, 1, 2, 3].some((k) => Math.abs(one.pixels[at + k] - other.pixels[at + k]) > 8)) count++
  return { count, all, share: all ? count / all : 0 }
}
