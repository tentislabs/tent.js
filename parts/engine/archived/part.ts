import { TentError } from '../../core/index.ts'
import type { SinkChange, Wrote } from '../../data/index.ts'

/**
 * What a part keeps of a row that a write wrote, beside the record, which holds the row as the write left it: the
 * id of the row, and what an undo needs and the record does not give - what a changed row held before, with the
 * columns that were set, and a removed row as it was, to be put back.
 */
function keptOf(wrote: Wrote): Wrote {
  const { table, kind, row, before, columns } = wrote
  if (kind === 'removed') return { table, kind, row }
  return {
    table,
    kind,
    row: { id: row.id },
    ...(kind === 'changed' && before ? { before, ...(columns ? { columns } : {}) } : {}),
  }
}

/**
 * One change as a part of the archive holds it: its head as JSON, then the record, each behind the count of its
 * bytes in four bytes. The record is the store's own, so a sealed value stands in it sealed. The head holds what the
 * record does not: the number, the moment, by whom, the file, the table steps and the tables a raw text stated,
 * and of each row of the app that was written what `keptOf` keeps. No raw text: the record holds what it did.
 */
export function changeBytes(change: SinkChange): Uint8Array {
  const { record = new Uint8Array(), rows = [], ...rest } = change
  // The tables of the engine are never taken back: the record alone holds their rows.
  const kept = rows.filter((one) => !one.table.startsWith('_t_')).map(keptOf)
  const head = new TextEncoder().encode(
    JSON.stringify({ ...rest, raw: undefined, ...(kept.length ? { rows: kept } : {}) }),
  )
  const bytes = new Uint8Array(8 + head.length + record.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, head.length)
  bytes.set(head, 4)
  view.setUint32(4 + head.length, record.length)
  bytes.set(record, 8 + head.length)
  return bytes
}

/** Whether what a part holds as the head of a change is one. */
const isHead = (value: unknown): value is Omit<SinkChange, 'record'> =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'n') === 'number' &&
  typeof Reflect.get(value, 'at') === 'number'

/** The head of the change that begins at a place of a part, as JSON, or nothing where it is not there whole. */
function headAt(bytes: Uint8Array, at: number, size: number): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes.subarray(at + 4, at + 4 + size)))
  } catch {
    // Bytes that are no JSON are no head: the change ends there.
    return undefined
  }
}

/**
 * Takes the bytes of a part of the archive, read once from the start. Answers the changes it holds whole, in the
 * order they were made, and the count of their bytes: what follows the last whole change, where a stop cut an
 * append off, is no change.
 */
export function wholeChangesIn(bytes: Uint8Array): { changes: SinkChange[]; size: number } {
  const changes: SinkChange[] = []
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 0
  while (at + 8 <= bytes.length) {
    const headSize = view.getUint32(at)
    if (at + 8 + headSize > bytes.length) break
    const head = headAt(bytes, at, headSize)
    const recordSize = view.getUint32(at + 4 + headSize)
    const start = at + 8 + headSize
    if (!isHead(head) || start + recordSize > bytes.length) break
    changes.push({ ...head, record: bytes.slice(start, start + recordSize) })
    at = start + recordSize
  }
  return { changes, size: at }
}

/** Takes the bytes of a part of the archive. Answers its changes, in the order they were made. Throws T0009 for bytes that are no part. */
export function changesIn(bytes: Uint8Array, name: string): SinkChange[] {
  const { changes, size } = wholeChangesIn(bytes)
  if (size !== bytes.length)
    throw new TentError('T0009', `The part \`${name}\` of the archive is broken: it cannot be read.`)
  return changes
}
