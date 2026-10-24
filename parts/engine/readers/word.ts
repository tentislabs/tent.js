import { inflateRawSync } from 'node:zlib'
import { TentError } from '../../core/index.ts'
import { htmlDecoded } from './html.ts'

/** The error of a packed file that opens to more than may be read. */
const tooLarge = (most: number): TentError =>
  new TentError('T0003', `The packed file opens to more than ${most} bytes, the most that is read of one.`, {
    fix: 'Read a smaller file, or raise `readSize` in `project.limits`.',
  })

const notWord = (): TentError =>
  new TentError('T0015', 'The file is no Word document: it holds no `word/document.xml`.', {
    fix: 'Read a file that Word wrote as `.docx`.',
  })

/**
 * Takes the bytes of a packed file, the name of one entry of it, and the most bytes that the entry may open to.
 * Answers the bytes of the entry, or nothing where the pack holds none of that name. The list at the end of the
 * pack says where each entry lies. Throws T0003 for an entry that opens to more than `most`, also where the list
 * states less: the entry is opened no further than `most`.
 */
function entryOf(pack: Uint8Array, name: string, most: number): Uint8Array | undefined {
  const bytes = Buffer.from(pack.buffer, pack.byteOffset, pack.byteLength)
  // The end of the pack names its list: it is looked for from the back, past a note that may follow it.
  let end = -1
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65_557); at--)
    if (bytes.readUInt32LE(at) === 0x06054b50) {
      end = at
      break
    }
  if (end < 0) return undefined
  let at = bytes.readUInt32LE(end + 16)
  const count = bytes.readUInt16LE(end + 10)
  for (let k = 0; k < count && at + 46 <= bytes.length; k++) {
    if (bytes.readUInt32LE(at) !== 0x02014b50) return undefined
    const [method, packed, size] = [
      bytes.readUInt16LE(at + 10),
      bytes.readUInt32LE(at + 20),
      bytes.readUInt32LE(at + 24),
    ]
    const [nameLength, extra, note] = [
      bytes.readUInt16LE(at + 28),
      bytes.readUInt16LE(at + 30),
      bytes.readUInt16LE(at + 32),
    ]
    const lies = bytes.readUInt32LE(at + 42)
    const entry = bytes.toString('utf8', at + 46, at + 46 + nameLength)
    at += 46 + nameLength + extra + note
    if (entry !== name) continue
    if (size > most) throw tooLarge(most)
    if (lies + 30 > bytes.length || bytes.readUInt32LE(lies) !== 0x04034b50) return undefined
    const from = lies + 30 + bytes.readUInt16LE(lies + 26) + bytes.readUInt16LE(lies + 28)
    const held = bytes.subarray(from, from + packed)
    if (method === 0) return held
    if (method !== 8) return undefined
    try {
      // A small entry that opens huge is stopped at the most that is read, whatever its list says of its size.
      return inflateRawSync(held, { maxOutputLength: most })
    } catch (error) {
      if (Reflect.get(Object(error), 'code') === 'ERR_BUFFER_TOO_LARGE') throw tooLarge(most)
      return undefined
    }
  }
  return undefined
}

/**
 * Takes the bytes of a Word document (`.docx`) and the most bytes that it may open to. Answers its words: each
 * paragraph is a line, a tab is a tab, and a break inside a paragraph is a line break. Throws T0015 for a file
 * that is no Word document, and T0003 for one that opens to more than `most`.
 */
export function wordsOfWord(pack: Uint8Array, most: number): string {
  const document = entryOf(pack, 'word/document.xml', most)
  if (!document) throw notWord()
  const xml = new TextDecoder('utf-8').decode(document)
  const lines: string[] = []
  for (const [, paragraph] of xml.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    let line = ''
    for (const [piece, text] of (paragraph ?? '').matchAll(
      /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>/g,
    ))
      line += text !== undefined ? htmlDecoded(text) : piece.startsWith('<w:tab') ? '\t' : '\n'
    lines.push(line)
  }
  return lines.join('\n')
}
