import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../core/index.ts'
import type { Here, Mode } from '../data/index.ts'
import { here, sqliteStore } from '../data/index.ts'
import type { App } from './app.ts'
import { asked, fetchData, placeData, removeHalf } from './copy/fetch.ts'
import { sameAddress, versionOf } from './held.ts'
import { readerKeysOf } from './copy/keys.ts'
import type { Reach } from './copy/reach.ts'
import { notReached, reachedBy } from './copy/reach.ts'
import type { ToldVersion } from './copy/versions.ts'
import { fetchVersion, holdsVersion, isTold, versionFolder } from './copy/versions.ts'
import { descriptionOf } from './format.ts'
import type { Program } from './opening/frame.ts'
import { claimed } from './open.ts'
import { opening } from './opening/opening.ts'
import { textAt } from './files.ts'

/**
 * What `engine.read` takes. `from` is the address of the writer, with its scheme. `key` is the key of this
 * reader. `far` makes it a far reader. `own` is the address by which the other machines of the app reach this
 * one. `readers` are the keys it lets join once it is the writer, and `workers` those of its workers. `reach` says how an address is reached in place
 * of the network, for machines in one program. `insecure` lets it reach its writer, and be found, over a
 * connection that is not secure. `address` is as in `engine.open`.
 */
export interface ReadOptions {
  from: string
  key: string
  dataFolder: string
  far?: boolean
  own?: string
  insecure?: boolean
  readers?: (string | { key: string; far: true })[]
  // The keys of the workers that it lets join once it is the writer, as `workers` of `open`.
  workers?: (string | { key: string; kinds?: string[]; atOnce?: number; workers?: number })[]
  reach?: Reach
  address?: string | string[]
}

const modes: Mode[] = ['development', 'test', 'live']

const isMode = (value: unknown): value is Mode => modes.some((one) => one === value)

/** What a data folder says of itself before it is opened: what its `_t_here` holds, and the version its data names. */
function peek(dataFolder: string): { mine: Here; version: string | undefined } {
  const store = sqliteStore()
  store.open(dataFolder, { readOnly: true })
  try {
    return { mine: here(store), version: versionOf(store) }
  } finally {
    store.close()
  }
}

/** Whether a shared file that was just fetched holds the directory of the files of tenants: the app keeps a file for each. */
function holdsDirectory(file: string): boolean {
  const store = sqliteStore()
  store.open(file, { readOnly: true })
  try {
    return store.layout().some((one) => one.name === '_t_tenants')
  } finally {
    store.close()
  }
}

/**
 * Takes what the engine hands an opening, and the options of `engine.read`. Opens the app as a reader of the
 * writer at `from`. On an empty data folder it first fetches the running version and the data, and throws T0029
 * where the writer is not reached. On a folder that holds data it answers once the store is open, whether the
 * writer is reached or not. A folder of the machine that took over from that address goes on as the writer. A
 * folder of any other writer changes nothing until it has reached a writer of a newer epoch. Throws T0013 for
 * options that do not read and for a store that cannot be copied, and T0011 for a version that cannot be kept.
 */
export async function readApp(program: Program, options: ReadOptions): Promise<App> {
  const { from, key } = Object(options)
  const wrong = (words: string, fix: string): TentError => new TentError('T0013', words, { fix })
  if (typeof from !== 'string' || !/^https?:\/\/[^/]+$/.test(from.replace(/\/+$/, '')))
    throw wrong(
      'A reader is told the address of its writer in `from`, with its scheme.',
      "Name it as `from: 'https://shop.example.com'`.",
    )
  if (typeof key !== 'string' || key.length < 32)
    throw wrong(
      'A reader is told its key, a text of 32 characters or more.',
      'Hand `key` the key that its writer names in `readers`.',
    )
  const writer = from.replace(/\/+$/, '')
  const insecure = options.insecure === true
  const keys = readerKeysOf(options.readers)
  const reads = {
    from: writer,
    key,
    far: options.far === true,
    ...(typeof options.own === 'string' ? { own: options.own } : {}),
  }
  const reached = reachedBy(options.reach, insecure)
  const { dataFolder, release } = await claimed(options.dataFolder, 'engine.read')
  try {
    mkdirSync(dataFolder, { recursive: true })
    removeHalf(dataFolder)
    /** Fetches what the writer tells of its versions, and the files of the running one that this folder lacks. */
    const fetched = async (): Promise<{ mode: Mode; running: ToldVersion }> => {
      const told = Object(await (await asked(reached(writer), writer, '/_t/copy/versions', key)).json())
      const list: unknown = told.list
      const running = isTold(list) ? list.find((one) => one.running) : undefined
      if (!isMode(told.mode) || !running) throw notReached(writer, 'it told no running version')
      const blob = async (fingerprint: string): Promise<Uint8Array> =>
        new Uint8Array(await (await asked(reached(writer), writer, `/_t/copy/blob/${fingerprint}`, key)).arrayBuffer())
      await fetchVersion(dataFolder, running, blob)
      return { mode: told.mode, running }
    }
    if (!existsSync(join(dataFolder, 'data.db'))) {
      // An empty folder: the running version first, so that the reader has its makers and its store, then the data.
      const { mode } = await fetched()
      await fetchData(reached(writer), writer, key, dataFolder)
      // Of an app that keeps a data file for each tenant, every file that the directory of the writer names.
      const sharedFile = join(dataFolder, 'data.db.fetch')
      let placeFiles = (): void => undefined
      if (holdsDirectory(sharedFile)) {
        const { fetchFiles, fetchedAtFirst, fetching } = await import('./files/reading.ts')
        const fetch = fetching(reached(writer), writer, key)
        placeFiles = await fetchFiles(dataFolder, sharedFile, sqliteStore, fetchedAtFirst, fetch)
      }
      placeData(dataFolder, { mode, ...reads }, false)
      placeFiles()
    }
    const { mine, version: named } = peek(dataFolder)
    let version = named
    if (version === undefined || !holdsVersion(dataFolder, version)) version = (await fetched()).running.version
    const bundleFolder = versionFolder(dataFolder, version)
    const description = descriptionOf(textAt(bundleFolder, 'description.json'))
    const mode = mine.mode ?? 'live'
    const common = {
      dataFolder,
      bundleFolder,
      description,
      version,
      mode,
      ...(options.address === undefined ? {} : { address: options.address }),
      ...(options.workers?.length ? { workers: (await import('./work/keys.ts')).workerKeysOf(options.workers) } : {}),
    }
    const told = {
      keys,
      insecure,
      ...(reads.own ? { own: reads.own } : {}),
      ...(options.reach ? { reach: options.reach } : {}),
    }
    if (mine.role !== 'reader' && mine.took && sameAddress(mine.took.from, writer)) {
      // The machine that took over, started by a command that nobody changed: it goes on as the writer.
      const app = await opening(program, { ...common, told })
      console.error(
        `The data folder ${dataFolder} took over from ${writer}, and is the writer: start it without \`--reads\`.`,
      )
      return app
    }
    const returning = mine.role !== 'reader'
    return await opening(program, {
      ...common,
      told: { ...told, reads: { ...reads, ...(returning ? { returning } : {}) } },
    })
  } catch (error) {
    release()
    throw error
  }
}
