import { closeSync, existsSync, openSync, readdirSync, renameSync, rmSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../../core/index.ts'
import type { Mode } from '../../data/index.ts'
import { here, setHere, sqliteStore } from '../../data/index.ts'
import { table as rateTable } from '../tables/rate.ts'
import { epochNumber, epochOf, numberOf } from '../held.ts'
import type { Reached } from './reach.ts'
import { notReached } from './reach.ts'

const system = { kind: 'system' } as const

/** The file that the data of a writer is fetched to, before it takes the place of the data file. */
const fetchFile = (dataFolder: string): string => join(dataFolder, 'data.db.fetch')

const dataFile = (dataFolder: string): string => join(dataFolder, 'data.db')

/** Removes the files that SQLite keeps beside a data file, which hold writes of that file alone. */
const withoutBeside = (file: string): void => {
  for (const beside of ['-wal', '-shm']) rmSync(`${file}${beside}`, { force: true })
}

/** Removes what a fetch that did not end left in a data folder: the half file, and any file SQLite kept beside it. */
export function removeHalf(dataFolder: string): void {
  if (!existsSync(dataFolder)) return
  for (const name of readdirSync(dataFolder))
    if (name.startsWith('data.db.fetch')) rmSync(join(dataFolder, name), { force: true })
}

/**
 * Takes what reaches the writer, its address, and the key of this reader. Asks one address of the link with the
 * key, and answers what it was answered. Throws T0029 where the writer is not reached, or answers anything but
 * what was asked for.
 */
export async function asked(reached: Reached, address: string, path: string, key: string): Promise<Response> {
  let answer: Response
  try {
    answer = await reached.request(
      // The bytes are asked for as they are: a packed answer would say the length of what was packed.
      new Request(`${address}${path}`, { headers: { authorization: `Bearer ${key}`, 'accept-encoding': 'identity' } }),
    )
  } catch (error) {
    // What this machine itself refuses, as an address that is not secure, is told as it is.
    if (error instanceof TentError) throw error
    throw notReached(address, error instanceof Error ? error.message : String(error))
  }
  if (!answer.ok) throw notReached(address, `it answered ${path} with the status ${answer.status}`)
  return answer
}

/**
 * Takes an answer and a file. Writes the body into the file as it arrives, piece by piece: a reader holds no whole
 * data file in memory. Answers how many bytes arrived, and throws what the reading of the body throws.
 */
export async function writtenTo(answer: Response, path: string): Promise<number> {
  const file = openSync(path, 'w')
  let arrived = 0
  try {
    for await (const piece of answer.body ?? []) {
      writeSync(file, piece)
      arrived += piece.length
    }
  } finally {
    closeSync(file)
  }
  return arrived
}

/**
 * Takes what reaches the writer, its address, the key of this reader and a data folder. Fetches the data of the
 * writer into `data.db.fetch` of that folder, and holds its length against the answer's. Throws T0029 where the
 * writer is not reached or the file did not arrive whole: no half file is left then.
 */
export async function fetchData(reached: Reached, address: string, key: string, dataFolder: string): Promise<void> {
  removeHalf(dataFolder)
  const answer = await asked(reached, address, '/_t/copy/data', key)
  let arrived: number
  try {
    arrived = await writtenTo(answer, fetchFile(dataFolder))
  } catch (error) {
    removeHalf(dataFolder)
    throw notReached(
      address,
      `its data did not arrive whole: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const length = Number(answer.headers.get('content-length') ?? Number.NaN)
  if (!Number.isInteger(length) || length !== arrived || length === 0) {
    removeHalf(dataFolder)
    throw notReached(address, 'its data did not arrive whole')
  }
}

/** What a reader writes into the `_t_here` of the data it fetched: its own, in place of the writer's. */
export interface Mine {
  // The id that the machine keeps, where it had one: a new one is made otherwise.
  id?: string
  mode: Mode
  from: string
  far: boolean
  own?: string
}

/**
 * Takes a data folder that holds a fetched file, what the reader says of itself, and in `lost` whether the data
 * file that stands there is kept. Sets `_t_here` of the fetched file to the reader's own, so that what the writer
 * held of itself goes and `keptFrom` stays as it came, empties `_t_rate`, and puts the file in the place of the
 * data file, while no store holds that place open. The file it replaces is removed, or moved beside the data as
 * `lost.<its epoch's number>.<its n>.db`. Answers the name of that file where one was kept. `n` is the number that
 * the machine held, where that is not the number of its data file: of an app that keeps a data file for each
 * tenant, the number of the app.
 */
export function placeData(dataFolder: string, mine: Mine, lost: boolean, n?: number): string | undefined {
  const fetched = fetchFile(dataFolder)
  const store = sqliteStore()
  store.open(fetched)
  try {
    // The id of the writer came with its file: this machine keeps its own, or is given one here.
    setHere(store, { id: mine.id })
    const { id } = here(store)
    setHere(store, {
      id,
      role: 'reader',
      mode: mine.mode,
      from: mine.from,
      far: mine.far ? true : undefined,
      own: mine.own,
      kept: undefined,
      near: undefined,
      took: undefined,
      back: undefined,
      stopped: undefined,
      take: undefined,
    })
    const counts = store.read({ from: rateTable.name }, system).value
    const keys = (Array.isArray(counts) ? counts : []).map((row) => String(row.key))
    if (keys.length) store.write((tx) => keys.forEach((key) => void tx.remove(rateTable.name, key, system)))
  } finally {
    store.close()
  }
  withoutBeside(fetched)
  const place = dataFile(dataFolder)
  let kept: string | undefined
  if (existsSync(place)) {
    if (lost) kept = movedAside(dataFolder, n)
    else rmSync(place, { force: true })
  }
  withoutBeside(place)
  renameSync(fetched, place)
  return kept
}

/**
 * Takes a data folder whose data file no store holds open. Moves the file beside the data as
 * `lost.<its epoch's number>.<its n>.db`, and answers that name: a machine keeps so what it held and its new
 * writer lacks.
 */
function movedAside(dataFolder: string, n?: number): string {
  const place = dataFile(dataFolder)
  const store = sqliteStore()
  store.open(place, { readOnly: true })
  let name: string
  try {
    name = `lost.${epochNumber(epochOf(store))}.${n ?? numberOf(store)}.db`
  } finally {
    store.close()
  }
  withoutBeside(place)
  rmSync(join(dataFolder, name), { force: true })
  renameSync(place, join(dataFolder, name))
  return name
}
