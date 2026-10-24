import type { Change, Row } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { forgetText } from '../readers/textKept.ts'
import { fileStore, holdsBytes } from '../stored/files.ts'
import { table as filesTable } from '../tables/files.ts'

const system = { kind: 'system' } as const

/** The bytes of one file as a machine fetches them: their fingerprint, their length and their kind. */
export interface FileBytes {
  fingerprint: string
  size: number
  kind: string
}

const bytesOf = (row: Row): FileBytes => ({
  fingerprint: String(row.fingerprint ?? ''),
  size: Number(row.size ?? 0),
  kind: String(row.kind ?? 'application/octet-stream'),
})

const isFingerprint = (one: FileBytes): boolean => /^[0-9a-f]{64}$/.test(one.fingerprint)

/** The files whose rows a change of the writer added. */
export function filesAdded(change: Change): FileBytes[] {
  return change.rows
    .filter((one) => one.table === filesTable.name && one.kind === 'added')
    .map((one) => bytesOf(one.row))
    .filter(isFingerprint)
}

/** The files whose rows the store of this machine holds. */
export function filesHeld(o: Opened): FileBytes[] {
  const rows: unknown = o.store.read({ from: filesTable.name }, system).value
  return (Array.isArray(rows) ? rows : []).map(bytesOf).filter(isFingerprint)
}

/** The fingerprints of the rows of files that a change will take away, read before it is applied. */
export function filesLeaving(o: Opened, change: Change): string[] {
  return change.rows
    .filter((one) => one.table === filesTable.name && one.kind === 'removed')
    .map((one) => o.store.read({ from: filesTable.name, one: 'get', id: String(one.row.id) }, system).value)
    .map((row) => String(Reflect.get(Object(row), 'fingerprint') ?? ''))
    .filter((one) => /^[0-9a-f]{64}$/.test(one))
}

/**
 * Removes the bytes of each fingerprint that no row of files names any more on this machine, and the words that
 * were read of them here: a store that the machines share keeps its bytes for the writer to remove.
 */
export async function bytesLeft(o: Opened, fingerprints: string[]): Promise<void> {
  for (const fingerprint of new Set(fingerprints)) {
    const named: unknown = o.store.read(
      { from: filesTable.name, where: { col: 'fingerprint', is: fingerprint }, count: true },
      system,
    ).value
    if (Number(named) !== 0) continue
    forgetText(o.dataFolder, fingerprint)
    if (fileStore(o).shared !== true) await fileStore(o).remove(fingerprint)
  }
}

/**
 * Takes a machine, one file, and what asks its writer for an address. Fetches the bytes with `GET
 * /_t/copy/file/<fingerprint>` and hands them to the file store of this machine, where the same bytes are kept
 * once. Throws where they cannot be fetched whole.
 */
export async function fetchBytes(o: Opened, file: FileBytes, ask: (path: string) => Promise<Response>): Promise<void> {
  const answer = await ask(`/_t/copy/file/${file.fingerprint}`)
  if (!answer.ok || !answer.body) {
    await answer.body?.cancel()
    throw new Error(`the writer answered ${answer.status}`)
  }
  // The bytes go to the store as they arrive, held to the size of the file: a reader holds no whole file in memory.
  let arrived = 0
  const counted = answer.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(piece, to) {
        arrived += piece.byteLength
        if (arrived > file.size) to.error(new Error(`the writer sent more than the ${file.size} bytes of the file`))
        else to.enqueue(piece)
      },
      flush(to) {
        if (arrived !== file.size)
          to.error(new Error(`the writer sent ${arrived} of the ${file.size} bytes of the file`))
      },
    }),
  )
  await fileStore(o).put(file.fingerprint, counted, { size: file.size, kind: file.kind })
}

/**
 * Takes a reader, files, and what asks its writer for an address. Fetches the bytes of each that this machine
 * lacks. Answers those it now holds, and those it could not fetch, which the log names. A file store that every
 * machine reaches needs none.
 */
export async function bytesOfFiles(
  o: Opened,
  files: FileBytes[],
  ask: (path: string) => Promise<Response>,
): Promise<{ held: string[]; lacking: FileBytes[] }> {
  const held: string[] = []
  const lacking: FileBytes[] = []
  if (fileStore(o).shared === true) return { held, lacking }
  for (const file of files) {
    try {
      if (!(await holdsBytes(o, file.fingerprint))) await fetchBytes(o, file, ask)
      held.push(file.fingerprint)
    } catch (error) {
      lacking.push(file)
      o.log.write('lines', {
        at: o.clock.now(),
        level: 'error',
        message: 'The bytes of a file could not be fetched from the writer.',
        data: JSON.stringify({ fingerprint: file.fingerprint, error: String(error) }),
      })
    }
  }
  return { held, lacking }
}
