import { epochIn, here, keepChanges } from '../../data/index.ts'
import { namesWriter } from '../held.ts'
import { bearerOf } from '../bearer.ts'
import { keyIn as keyRowIn } from './caller.ts'
import { keysOf } from './kept.ts'
import type { Opened } from '../opened.ts'
import type { ReaderKey } from '../copy/keys.ts'

/** Whether the keys of an app hold one of a reader: an app that holds one opens as a machine among machines. */
export const holdsReaderKeys = (o: Opened): boolean =>
  keysOf(o).some((key) => key.rights?.includes('copy') || key.rights?.includes('far'))

/** Readies the data of a writer to be handed to a reader: its epoch names its writer, and every change is kept. */
function readyForReaders(o: Opened): void {
  if (o.machine.reader) return
  // The data that a reader is handed names the writer of its epoch, as a writer that was opened with readers does.
  const mine = here(o.store)
  if (mine.role !== 'stopped' && !namesWriter(o.store)) o.store.write((tx) => epochIn(tx, mine.id))
  // An app that kept no change keeps every one from the first reader that a key of its own brings.
  if (!here(o.store).kept) {
    if (o.machine.writer) o.machine.writer.keepsFrom()
    else keepChanges(o.files ?? o.store)
  }
}

/**
 * Takes an app and a request for an address of the link. Answers the key of a reader that a row of the keys of
 * the app gives: one whose rights hold `copy` or `far`, and readies the data to be handed to that reader. A key of
 * `far` alone is a far reader whatever its reader says. Nothing for a request with no such key: a key of the API,
 * and one of another right, is no key of a reader.
 */
export function readerJoins(o: Opened, request: Request): ReaderKey | undefined {
  const found = keyRowIn(o, request)
  const rights = found?.key.rights ?? []
  if (!found || !(rights.includes('copy') || rights.includes('far'))) return undefined
  readyForReaders(o)
  return { id: found.key.id, key: bearerOf(request), far: !rights.includes('copy') }
}
