/**
 * One entry of an archive: its path as the archive writes it, what it is, its mode, its bytes where it is a file,
 * and where it points where it is a link: for a link as it was written, and for a hard link the path of an entry.
 */
export interface ArchiveEntry {
  path: string
  kind: 'file' | 'folder' | 'link' | 'hard'
  mode: number
  to: string
  bytes(): Uint8Array | Promise<Uint8Array>
}

const decoder = new TextDecoder()

/** Reads the text of a field of a header, which ends at its first zero byte. */
function textAt(block: Uint8Array, at: number, length: number): string {
  const field = block.subarray(at, at + length)
  const end = field.indexOf(0)
  return decoder.decode(end < 0 ? field : field.subarray(0, end))
}

/** Reads a number of a header: digits of base eight, or, with the first bit set, the number itself in bytes. */
function numberAt(block: Uint8Array, at: number, length: number): number {
  const field = block.subarray(at, at + length)
  if (((field[0] ?? 0) & 0x80) !== 0) return field.subarray(1).reduce((all, byte) => all * 256 + byte, 0)
  const digits = textAt(block, at, length).trim()
  return digits === '' ? 0 : Number.parseInt(digits, 8)
}

/** Reads the path and the link of an entry from the record that the newer form of an archive writes before it. */
function extended(data: Uint8Array): { path?: string; to?: string } {
  const found: { path?: string; to?: string } = {}
  for (let at = 0; at < data.length; ) {
    const space = data.indexOf(0x20, at)
    const length = space < 0 ? Number.NaN : Number(decoder.decode(data.subarray(at, space)))
    if (!(length > 0)) break
    const [key = '', ...value] = decoder.decode(data.subarray(space + 1, at + length - 1)).split('=')
    if (key === 'path') found.path = value.join('=')
    if (key === 'linkpath') found.to = value.join('=')
    at += length
  }
  return found
}

const kinds: Record<string, ArchiveEntry['kind']> = { '0': 'file', '\0': 'file', '7': 'file', '5': 'folder' }

/**
 * Takes the bytes of a tar archive, in the first form, the newer one, or as GNU tar writes long paths. Answers its
 * entries in their order. Throws for bytes that are no such archive, and for an entry that is neither a file, a
 * folder nor a link: a part holds no device and no pipe.
 */
export function readTar(bytes: Uint8Array): ArchiveEntry[] {
  const entries: ArchiveEntry[] = []
  let ahead: { path?: string; to?: string } = {}
  for (let at = 0; at + 512 <= bytes.length; ) {
    const head = bytes.subarray(at, at + 512)
    if (head.every((byte) => byte === 0)) break
    // The sum of a header counts its own field as eight spaces.
    const sum = head.reduce((all, byte, k) => all + (k >= 148 && k < 156 ? 0x20 : byte), 0)
    if (sum !== numberAt(head, 148, 8)) throw new Error('The bytes are no archive that the engine reads.')
    const size = numberAt(head, 124, 12)
    const data = bytes.subarray(at + 512, at + 512 + size)
    if (data.length < size) throw new Error('The archive ends in the middle of an entry.')
    at += 512 + Math.ceil(size / 512) * 512
    const kind = String.fromCharCode(head[156] ?? 0)
    if (kind === 'L') ahead.path = textAt(data, 0, data.length)
    else if (kind === 'K') ahead.to = textAt(data, 0, data.length)
    else if (kind === 'x') ahead = { ...ahead, ...extended(data) }
    // A record for every entry that follows names no path, so nothing of it is read.
    else if (kind !== 'g') {
      const first = textAt(head, 345, 155)
      const name = textAt(head, 0, 100)
      const path = ahead.path ?? (textAt(head, 257, 5) === 'ustar' && first !== '' ? `${first}/${name}` : name)
      const to = ahead.to ?? textAt(head, 157, 100)
      ahead = {}
      const what = kind === '2' ? 'link' : kind === '1' ? 'hard' : kinds[kind]
      if (!what) throw new Error(`The archive holds ${path}, an entry of the kind ${JSON.stringify(kind)}.`)
      entries.push({
        path,
        // The first form of an archive writes a folder as a file whose path ends in a slash.
        kind: what === 'file' && path.endsWith('/') ? 'folder' : what,
        mode: numberAt(head, 100, 8) & 0o777,
        to,
        bytes: () => data,
      })
    }
  }
  return entries
}
