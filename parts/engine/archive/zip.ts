import { promisify } from 'node:util'
import { inflateRaw } from 'node:zlib'
import type { ArchiveEntry } from './tar.ts'

const opened = promisify(inflateRaw)
const decoder = new TextDecoder()

// The marks of a zip archive: of its end, of a line of its list, and of an entry itself.
const marks = { end: 0x06054b50, listed: 0x02014b50, entry: 0x04034b50 }

// The kinds of a file as macOS and Linux write them into the mode of an entry.
const ofLink = 0o120000
const ofKind = 0o170000

/**
 * Takes the bytes of a zip archive. Answers its entries in the order of its list, each with its bytes opened when
 * they are asked for. Throws for bytes that are no such archive, for an archive that is locked or larger than the
 * first form of a zip archive holds, and for an entry that is packed in a way the runtime does not open.
 */
export async function readZip(bytes: Uint8Array): Promise<ArchiveEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // The end of the archive is found from behind: a note of up to 65,535 bytes may follow it.
  let end = bytes.length - 22
  while (end >= 0 && end >= bytes.length - 22 - 0xffff && view.getUint32(end, true) !== marks.end) end--
  if (end < 0 || view.getUint32(end, true) !== marks.end)
    throw new Error('The bytes are no archive that the engine reads.')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  if (count === 0xffff || at === 0xffffffff) throw new Error('The archive is larger than the engine reads one.')

  const entries: ArchiveEntry[] = []
  for (let k = 0; k < count; k++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== marks.listed)
      throw new Error('The list of the archive is broken.')
    const madeOn = view.getUint16(at + 4, true) >> 8
    const flags = view.getUint16(at + 8, true)
    const method = view.getUint16(at + 10, true)
    const [packed, size] = [view.getUint32(at + 20, true), view.getUint32(at + 24, true)]
    const lengths = [view.getUint16(at + 28, true), view.getUint16(at + 30, true), view.getUint16(at + 32, true)]
    const mode = madeOn === 3 ? view.getUint32(at + 38, true) >>> 16 : 0
    const entryAt = view.getUint32(at + 42, true)
    const path = decoder.decode(bytes.subarray(at + 46, at + 46 + lengths[0]))
    at += 46 + lengths[0] + lengths[1] + lengths[2]

    if ((flags & 1) !== 0) throw new Error(`The archive holds ${path} locked with a password.`)
    if (method !== 0 && method !== 8) throw new Error(`The archive holds ${path} packed in a way that is not opened.`)
    if (entryAt + 30 > bytes.length || view.getUint32(entryAt, true) !== marks.entry)
      throw new Error(`The archive names ${path} at a place that holds no entry.`)
    const from = entryAt + 30 + view.getUint16(entryAt + 26, true) + view.getUint16(entryAt + 28, true)
    const data = bytes.subarray(from, from + packed)
    if (data.length < packed) throw new Error('The archive ends in the middle of an entry.')
    const open = async (): Promise<Uint8Array> => {
      const plain = method === 0 ? data : await opened(data)
      if (plain.length !== size) throw new Error(`The archive holds ${path} with another size than it names.`)
      return plain
    }
    const link = (mode & ofKind) === ofLink
    entries.push({
      path,
      kind: path.endsWith('/') ? 'folder' : link ? 'link' : 'file',
      mode: mode & 0o777,
      // Where a link points is what the archive holds as its content.
      to: link ? decoder.decode(await open()) : '',
      bytes: open,
    })
  }
  return entries
}
