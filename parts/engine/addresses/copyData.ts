import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TentError } from '../../core/index.ts'
import { keepFrom } from '../../data/index.ts'
import { manyLimit, placeOf } from '../held.ts'
import type { Address } from '../door/address.ts'
import type { Opened } from '../opened.ts'
import { keyed } from '../door/keyed.ts'
import { fileAnswer } from '../web/fileStream.ts'

// One snapshot is made at a time, for each app: a second reader waits for its turn.
const turns = new WeakMap<Opened, Promise<unknown>>()

// What each app keeps for the readers that fetch its data: for each fetch the number it keeps from, and until when.
const fetches = new WeakMap<Opened, Set<{ n: number; until: number }>>()

/**
 * Has an app keep every change that a fetch of its data needs: from the lowest number that a fetch which is under
 * way or was sent not long ago holds, until the last of them needs it no more.
 */
function kept(o: Opened): void {
  const all = fetches.get(o) ?? new Set()
  fetches.set(o, all)
  for (const one of [...all]) if (one.until < o.clock.now()) all.delete(one)
  if (!all.size) return
  const [n, until] = [Math.min(...[...all].map((one) => one.n)), Math.max(...[...all].map((one) => one.until))]
  keepFrom(o.store, n, until)
}

/**
 * Makes a snapshot of the data of an app in the system's temporary place, and answers it as a stream. From the
 * moment it is asked for, while it is being fetched, and for `changesKept` after it was sent, every change after
 * the number that the data holds now is kept, past the bound of what is kept. The change of that number is kept
 * with them: the place of the reader that fetched this file is held against its running fingerprint.
 */
async function snapshotOf(o: Opened): Promise<Response> {
  const folder = mkdtempSync(join(tmpdir(), 'tent-copy-'))
  const removed = (): void => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  const mine = { n: placeOf(o).n - 1, until: Number.MAX_SAFE_INTEGER }
  const all = fetches.get(o) ?? new Set()
  fetches.set(o, all.add(mine))
  kept(o)
  try {
    const file = join(folder, 'data.db')
    await o.store.snapshot(file)
    return fileAnswer(file, () => {
      removed()
      // The file was sent, or the reader gave the fetch up: it has `changesKept` to join from here on.
      mine.until = o.clock.now() + manyLimit(o.description, 'changesKept')
      if (!o.closed) kept(o)
    })
  } catch (error) {
    removed()
    all.delete(mine)
    throw error
  }
}

/** Makes a snapshot of the data file of one tenant, and answers it as a stream. Throws T0001 for an app that keeps none, and for a tenant with no file. */
async function fileOf(o: Opened, file: { table: string; id: string }): Promise<Response> {
  if (!o.tenantFiles)
    throw new TentError('T0001', 'This app keeps no data file for each tenant.', {
      fix: 'Ask for `/_t/copy/data` with no table and no id.',
    })
  const { copy, remove } = await (await import('../files/reading.ts')).tenantFileCopy(o, o.tenantFiles, file)
  try {
    return fileAnswer(copy, remove)
  } catch (error) {
    remove()
    throw error
  }
}

/**
 * `GET /_t/copy/data`: the data file as a snapshot writes it, as a stream of its bytes, with its length. The file
 * holds its own number, epoch and running fingerprint, and the kept changes. A reader answers it too, from its
 * own data.
 */
export const address: Address = {
  order: 1,
  match: (request) => request.method === 'GET' && new URL(request.url).pathname === '/_t/copy/data' && {},
  steps: [1, 2, 3, 10],
  handle: (reached) =>
    keyed(reached, 'copy/data', async () => {
      const { app, request } = reached
      const { searchParams } = new URL(request.url)
      const [table, id] = [searchParams.get('table'), searchParams.get('id')]
      const before = turns.get(app) ?? Promise.resolve()
      // With a table and an id it is the data file of one tenant, of an app that keeps one for each.
      const mine = before.then(() => (table === null || id === null ? snapshotOf(app) : fileOf(app, { table, id })))
      turns.set(
        app,
        mine.catch(() => undefined),
      )
      return await mine
    }),
}
