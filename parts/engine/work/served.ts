import { TentError } from '../../core/index.ts'
import type { Clock } from '../../core/internal.ts'
import { sqliteStore } from '../../data/index.ts'
import { loadCode } from '../code.ts'
import { versionFolder } from '../copy/versions.ts'
import { descriptionOf } from '../format.ts'
import type { Makers } from '../makers.ts'
import type { Opened } from '../opened.ts'
import { holdOf } from '../rooms/hold.ts'
import { makeRoom } from '../rooms/makeRoom.ts'
import { textAt } from '../files.ts'

/** The error of what a worker cannot do: it holds the code of an app and none of its data. */
const noData = (what: string): TentError =>
  new TentError('T0013', `A worker holds no ${what}: it asks its writer.`, {
    fix: 'Read and write through what the work is handed, which crosses to the writer.',
  })

/**
 * Takes the folder of a worker, a version that it holds, its clock, the mode of the app, and the maker of a room of
 * the worker's program. Has the version's room load its code and answers what the work of a task is carried out
 * against: its description and its arrows, a store that is never opened, and no app and no machine, since a
 * worker holds none of the data of the app.
 */
export async function servedOn(
  folder: string,
  version: string,
  clock: Clock,
  mode: Opened['mode'],
  room?: Makers['room'],
): Promise<Opened> {
  const bundle = versionFolder(folder, version)
  const description = descriptionOf(textAt(bundle, 'description.json'))
  const hold = holdOf(description)
  const where = { app: description.app.name, dataFolder: folder, mode, where: 'worker' as const }
  const o: Opened = {
    room: makeRoom({ room }, { ...where, ...(hold === undefined ? {} : { hold }) }),
    name: description.app.name,
    mode,
    dataFolder: folder,
    bundle,
    version,
    description,
    store: sqliteStore(),
    clock,
    log: {
      write: () => undefined,
      writeAll: () => undefined,
      rows: () => [],
      withTrace: () => [],
      traceOfRun: () => undefined,
      last: () => 0,
      dropBefore: () => 0,
      forget: () => 0,
      close: () => undefined,
    },
    runs: new Map(),
    allows: new Map(),
    rules: {},
    handles: new Map(),
    made: [],
    before: [],
    inFlight: new Set(),
    closed: false,
    token: '',
    // A worker waits for no opening and closes no app.
    waits: { open: 0, stop: 0 },
    get app(): never {
      throw noData('app')
    },
    get machine(): never {
      throw noData('machine of the app')
    },
    web: {
      names: () => false,
      own: () => false,
      about: () => ({ from: '', scheme: 'https', host: '', origin: '', proxied: false }),
    },
    raise: () => undefined,
    left: () => undefined,
  }
  try {
    await loadCode(o)
  } catch (error) {
    await o.room.close()
    throw error
  }
  return o
}
