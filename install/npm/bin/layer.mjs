// The reader of a layer: a tar packed with Brotli, opened by the runtime itself, whose every entry is held before
// anything of it is laid. It runs on every Node.js that npm still runs on, so it stands on nothing of the framework.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { brotliDecompressSync } from 'node:zlib'

/** The text of a field of a header, which ends at its first zero byte. */
const text = (bytes, at, length) => {
  const field = bytes.subarray(at, at + length)
  const end = field.indexOf(0)
  return field.subarray(0, end < 0 ? length : end).toString('utf8')
}

/** A number of a header, in digits of base eight. */
const number = (bytes, at, length) => Number.parseInt(text(bytes, at, length).trim() || '0', 8)

/** Why a path of an entry may not be laid, or nothing where it may: it stays inside the folder, on every system. */
function wrongPath(path) {
  if (path === '' || path.includes('\0')) return 'it has no name'
  if (path.includes('\\')) return 'it holds a backslash'
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.includes(':')) return 'it names a place by itself'
  for (const piece of path.replace(/\/$/, '').split('/')) {
    if (piece === '' || piece === '.' || piece === '..') return 'it climbs out of its folder'
    if (/[. ]$/.test(piece)) return 'a piece of it ends with a dot or a space'
  }
  return undefined
}

/**
 * Takes the bytes of a layer. Answers its entries, each a folder or a file with its bytes and whether it runs.
 * Throws for bytes that are no layer, for an entry that is a link or anything else than a folder or a file, and for
 * a path that would leave the folder it is laid in, or that two entries share.
 */
export function readLayer(packed) {
  const bytes = brotliDecompressSync(packed)
  const entries = []
  const seen = new Set()
  let long
  for (let at = 0; at + 512 <= bytes.length; ) {
    const head = bytes.subarray(at, at + 512)
    if (head.every((one) => one === 0)) break
    let sum = 0
    for (let k = 0; k < 512; k++) sum += k >= 148 && k < 156 ? 32 : head[k]
    if (sum !== number(head, 148, 8)) throw new Error('the layer is damaged: a header does not hold its sum')
    const kind = String.fromCharCode(head[156] || 48)
    const size = number(head, 124, 12)
    const body = bytes.subarray(at + 512, at + 512 + size)
    at += 512 + Math.ceil(size / 512) * 512
    if (kind === 'x') {
      const found = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'))
      long = found ? found[1] : undefined
      continue
    }
    const path = long ?? text(head, 0, 100)
    long = undefined
    if (kind !== '0' && kind !== '5') throw new Error(`the layer holds ${path}, which is no folder and no file`)
    const why = wrongPath(path)
    if (why) throw new Error(`the layer holds ${JSON.stringify(path)}, which is not laid: ${why}`)
    const key = path.replace(/\/$/, '').toLowerCase()
    if (seen.has(key)) throw new Error(`the layer holds ${path} twice`)
    seen.add(key)
    entries.push({ path: path.replace(/\/$/, ''), folder: kind === '5', bytes: body, runs: (number(head, 100, 8) & 0o111) !== 0 })
  }
  return entries
}

/** Lays the entries of a layer into a folder, which is new. */
export function layEntries(entries, folder) {
  mkdirSync(folder, { recursive: true })
  for (const entry of entries) {
    const to = join(folder, ...entry.path.split('/'))
    if (entry.folder) {
      mkdirSync(to, { recursive: true })
      continue
    }
    mkdirSync(dirname(to), { recursive: true })
    writeFileSync(to, entry.bytes, { flag: 'wx' })
    if (entry.runs && process.platform !== 'win32') chmodSync(to, 0o755)
  }
}
