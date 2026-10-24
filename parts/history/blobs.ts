import { gunzipSync, gzipSync } from 'node:zlib'
import { fingerprintOf } from '../core/internal.ts'
import type { SqliteFile } from '../data/index.ts'

/** Whether the history holds the bytes of a fingerprint. */
export const hasBlob = (file: SqliteFile, print: string): boolean =>
  file.all('SELECT 1 FROM blobs WHERE fingerprint = ?', [print]).length > 0

/** Keeps bytes under their fingerprint, packed with the runtime's gzip, where they are not kept yet. Answers the fingerprint. */
export function keepBlob(file: SqliteFile, bytes: Uint8Array, known?: string): string {
  const print = known ?? fingerprintOf(bytes)
  if (!hasBlob(file, print))
    file.run('INSERT INTO blobs (fingerprint, size, bytes) VALUES (?, ?, ?)', [print, bytes.length, gzipSync(bytes)])
  return print
}

/** The bytes of a fingerprint as they were, or nothing where the history holds none. */
export function blobOf(file: SqliteFile, print: string): Uint8Array | undefined {
  const [row] = file.all('SELECT bytes FROM blobs WHERE fingerprint = ?', [print])
  const packed: unknown = row ? Reflect.get(row, 'bytes') : undefined
  return packed instanceof Uint8Array ? new Uint8Array(gunzipSync(packed)) : undefined
}
