// A layer as one archive: the files of folders written as a tar, in the form that every reader of tar takes, and
// packed with Brotli, which the runtime opens itself. The headers of a tar are written here alone, the mode of an
// entry of a tar that npm packed among them.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'

/** A field of a header, written in its place: text, or a number in digits of base eight. */
function field(block, at, length, value) {
  const text = typeof value === 'number' ? `${value.toString(8).padStart(length - 1, '0')}\0` : value
  block.write(text, at, Math.min(Buffer.byteLength(text), length), 'utf8')
}

/** Writes the sum of a header, which a reader holds it to: the sum of its bytes, its own field counted as spaces. */
function summed(block) {
  block.fill(' ', 148, 156)
  let sum = 0
  for (const byte of block) sum += byte
  field(block, 148, 8, sum)
}

/** The header of one entry: its name, its mode, its size and its kind, with the sum that a reader holds it to. */
function header(name, o) {
  const block = Buffer.alloc(512)
  field(block, 0, 100, name)
  field(block, 100, 8, o.mode)
  field(block, 108, 8, 0)
  field(block, 116, 8, 0)
  field(block, 124, 12, o.size)
  field(block, 136, 12, o.time)
  block.write(o.kind, 156, 1)
  block.write('ustar\0', 257)
  block.write('00', 263)
  summed(block)
  return block
}

/** Takes the header of an entry of a tar, and a mode. Writes the mode into it, with the sum that changes with it. */
export function modeIn(block, mode) {
  field(block, 100, 8, mode)
  summed(block)
}

/**
 * Takes the bytes of a tar. Answers the header of each entry that is a folder or a file, as a view of those bytes,
 * with its path and its kind. A path too long for its header is named by the record before it, in the newer form.
 */
export function headersOf(bytes) {
  const found = []
  let long
  for (let at = 0; at + 512 <= bytes.length && bytes[at] !== 0; ) {
    const head = bytes.subarray(at, at + 512)
    const text = (from, length) =>
      head
        .subarray(from, from + length)
        .toString('utf8')
        .replace(/\0.*$/s, '')
    const size = Number.parseInt(text(124, 12).trim() || '0', 8)
    const kind = text(156, 1) || '0'
    if (kind === 'x') {
      long = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(bytes.subarray(at + 512, at + 512 + size).toString('utf8'))?.[1]
    } else {
      const prefix = text(345, 155)
      found.push({ head, path: long ?? (prefix ? `${prefix}/${text(0, 100)}` : text(0, 100)), kind })
      long = undefined
    }
    at += 512 + Math.ceil(size / 512) * 512
  }
  return found
}

/** The record that names an entry whose path is too long for its header, in the newer form of tar. */
function longName(name, time) {
  const line = (key, value) => {
    const body = ` ${key}=${value}\n`
    // The length counts its own digits.
    const own = Buffer.byteLength(body)
    let length = own + String(own).length
    while (own + String(length).length !== length) length = own + String(length).length
    return `${length}${body}`
  }
  const data = Buffer.from(line('path', name))
  return [header('././@PaxHeader', { mode: 0o644, size: data.length, time, kind: 'x' }), padded(data)]
}

const padded = (bytes) => Buffer.concat([bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512)])

/**
 * Takes the folder the paths are taken from, the folders under it whose files the archive holds, a moment that every
 * entry is written with, and which files may be run. Answers the bytes of the archive: a folder and then every file
 * under it, in the order of their paths, so that the same files make the same bytes.
 */
export function tarOf(base, folders, o) {
  const pieces = []
  const add = (path) => {
    const full = join(base, path)
    const stat = statSync(full)
    const named = stat.isDirectory() ? `${path}/` : path
    if (Buffer.byteLength(named) > 99) pieces.push(...longName(named, o.time))
    const short = Buffer.byteLength(named) > 99 ? named.slice(0, 99) : named
    if (stat.isDirectory()) {
      pieces.push(header(short, { mode: 0o755, size: 0, time: o.time, kind: '5' }))
      for (const entry of readdirSync(full).sort()) add(`${path}/${entry}`)
      return
    }
    const bytes = readFileSync(full)
    const runs = o.runs(path, stat)
    pieces.push(header(short, { mode: runs ? 0o755 : 0o644, size: bytes.length, time: o.time, kind: '0' }), padded(bytes))
  }
  for (const folder of folders) add(folder)
  pieces.push(Buffer.alloc(1024))
  return Buffer.concat(pieces)
}

/** Packs bytes with Brotli, at the quality that is handed in, with the largest window for a large layer. */
export const brotliOf = (bytes, quality) =>
  brotliCompressSync(bytes, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: quality,
      [constants.BROTLI_PARAM_LGWIN]: 24,
      [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
    },
  })
