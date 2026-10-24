import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { fingerprintOf } from '../../core/internal.ts'
import type { ChangeSink, FileName, SinkChange } from '../../data/index.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { namedStore } from '../stored/named.ts'
import { changeBytes, changesIn, wholeChangesIn } from './part.ts'
import type { ArchivePlace } from './place.ts'
import { folderPlace, storePlace } from './place.ts'

/**
 * One part of the archive as its list names it: the numbers and the times of its first and its last change, and
 * the fingerprint of its bytes, by which a part that was changed or cut off is found.
 */
interface PartEntry {
  name: string
  from: number
  to: number
  fromAt: number
  toAt: number
  print?: string
}

/**
 * One backup that the archive rests on: its name in the folder of the backups, the number of the last write it
 * holds, and the moment it was begun at, by the clock of the app. `files`: of a backup that the store holds a
 * copy of, the paths of its files, `.` alone for a backup that is one file.
 */
export interface Rested {
  name: string
  n: number
  at: number
  files?: string[]
}

/**
 * A moment at which the data was put back: the changes made before it and after the backup it stands on are of
 * another history than those after it. `from` names the backup that was put back, where it is one the archive
 * rests on. `of` names the file of the one tenant that was put back, where the rest stood as it was.
 */
export interface PutBack {
  at: number
  from?: string
  of?: FileName
}

/**
 * Writes that never reached the archive: those after the number `from - 1` and up to `to`, made after the moment
 * `after` of the last change the archive holds, and found at the moment `at`, when a backup was taken.
 */
interface Gap {
  from: number
  to: number
  after: number
  at: number
}

/** The list of the archive. `last` is the newest change that a part holds. */
interface Listed {
  generation: number
  parts: PartEntry[]
  backups: Rested[]
  restores?: PutBack[]
  gaps?: Gap[]
  last?: { n: number; at: number }
}

/** The archive of the changes of an app, as the engine holds it. */
export interface Archive {
  /** The sink that the data hands each committed write, with its record. */
  sink: ChangeSink
  /** The app was opened as the writer: a backup that a gap asks for is taken. */
  started(): void
  /**
   * A backup was taken: it is written down, a store is handed a copy of it, the backups that are no longer kept
   * are let go of, and the parts of the archive that no kept backup needs are removed.
   */
  backedUp(backup: { name: string; n: number; at: number }, kept: string[]): Promise<void>
  /** The data was put back at a moment, from a backup or from another file. */
  restored(put: PutBack): Promise<void>
  /** The backups the archive rests on, and the moments at which the data was put back, the oldest first. */
  backups(): Promise<{ backups: Rested[]; restores: PutBack[] }>
  /** The changes made after a backup, from a moment and up to a moment, in the order they were made. */
  changesAfter(backup: Rested, from: number, until: number): Promise<SinkChange[]>
  /**
   * Hands each change made from a moment and up to a moment to `take`, in the order they were made, as far back as
   * the archive reaches: one part of the archive is read at a time, so what is held is what `take` keeps. Throws
   * T0009 where a gap of the archive lies between the two, and names it.
   */
  eachBetween(from: number, until: number, take: (change: SinkChange) => void): Promise<void>
  /** Answers where a backup stands, as a file or a folder: in the folder of the backups, or fetched from the store into `into`. */
  fetched(backup: Rested, into: string): Promise<string>
  /** Sends the part that is open, and every part that waits, and lets go. */
  close(): Promise<void>
}

const archives = new WeakMap<Opened, Archive>()

/** The archive of an app, where it keeps one. */
export const archiveOf = (o: Opened): Archive | undefined => archives.get(o)

/** Whether a project keeps an archive: wherever its backups do not state `archive: false`. */
export const keepsArchive = (description: Description): boolean => Object(description.project.backups).archive !== false

/**
 * The sink that the data of an app is connected to where the app keeps an archive: it hands each write to the
 * archive of the app, where the app holds one. A reader holds none until it takes over, and its store records
 * nothing meanwhile: the sink says that it records only while an archive is there.
 */
export function archiveSink(o: Opened): ChangeSink {
  return {
    get records() {
      return archives.has(o) ? (true as const) : undefined
    },
    start: (n) => archiveOf(o)?.sink.start(n) ?? { n, all: true },
    wrote: (change) => archiveOf(o)?.sink.wrote(change),
  }
}

const listNames = ['list-a.json', 'list-b.json']

const isListed = (value: unknown): value is Listed =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'generation') === 'number' &&
  Array.isArray(Reflect.get(value, 'parts')) &&
  Array.isArray(Reflect.get(value, 'backups'))

/** Every file of a folder, by its path from the folder, written with `/`. */
function filesUnder(folder: string, path = ''): string[] {
  const found: string[] = []
  for (const name of readdirSync(join(folder, path)).sort()) {
    const below = path ? `${path}/${name}` : name
    if (statSync(join(folder, below)).isDirectory()) found.push(...filesUnder(folder, below))
    else found.push(below)
  }
  return found
}

const moment = (at: number): string => new Date(at).toISOString()

/** The error of a span of time that a gap of the archive lies in: what never reached it cannot be put back or undone. */
const inGap = (gap: Gap): TentError =>
  new TentError(
    'T0009',
    `The archive has a gap: the writes ${gap.from} to ${gap.to}, made after ${moment(gap.after)}, never reached it, since the program stopped before it took them; it was found at ${moment(gap.at)}.`,
    {
      fix: 'Restore to a moment before the gap, or after the backup that was taken when it was found. An undo reaches back no further than that backup.',
    },
  )

/**
 * Takes what the engine holds of an app that is the writer of its data. Makes its archive, the engine's own sink:
 * every committed change of every data file, in order, as the record a reader applies, cut into parts of
 * `limits.archivePart`, each named by the number of its first change and its time. A change is appended to the
 * file of the part that is open as it comes, in the folder of the backups, so a stop loses nothing that reached
 * it: the part is closed when it is full and sent whole, and a part that a stop left open, or left unsent, is sent
 * at the next start. The parts lie in `backups/archive/` of the data folder, or in the store that `backups.store`
 * names, which then holds a copy of each backup too. Where the data stands past the last change the archive
 * holds, the writes between were lost to it: the list names that gap, and a backup is taken at once.
 */
export function makeArchive(o: Opened): Archive {
  const folder = join(o.dataFolder, 'backups')
  // The part that is open, and the parts that are closed and wait to be sent, lie in the folder of the archive
  // beside the backups whatever the place: a store is handed a part whole.
  const local = join(folder, 'archive')
  const openFile = join(local, 'open.part')
  // A part that waits to be sent: its name as a part, behind this word.
  const waits = 'sending-'
  const stated: unknown = Object(o.description.project.backups).store
  let place: ArchivePlace | undefined
  const placeOf = (): ArchivePlace => {
    place ??= stated === undefined ? folderPlace(join(folder, 'archive')) : storePlace(namedStore(o, stated), o.name)
    return place
  }
  const partSize = storedLimit(o.description, 'archivePart')
  let list: Listed = { generation: 0, parts: [], backups: [] }
  // The part that is open: the file it is written to, its first change and its bytes.
  let open: { file: number; head: { n: number; at: number }; size: number } | undefined
  let closed = false
  let up = false
  let backupOwed = false
  // The backup that a gap asked for, while it is taken: the archive is closed after it.
  let backingUp: Promise<void> = Promise.resolve()
  let queue: Promise<void> = Promise.resolve()
  let loaded: Promise<void> | undefined
  const line = (level: string, message: string, data: object = {}): void => {
    if (!o.log) return
    o.log.write('lines', { at: o.clock.now(), level, message, data: JSON.stringify(data) })
  }

  /** Puts a job on the one line of the archive's writes: one at a time, in order. A job that fails says so in the log. */
  const then = (job: () => Promise<void>, what: string): Promise<void> => {
    const run = queue.then(job).catch((error: unknown) => {
      line('error', `The archive could not ${what}.`, { error: String(error) })
    })
    queue = run
    return run
  }

  /** Reads the newest list that the place holds: of the two, the one of the higher generation that reads whole. */
  const readList = async (): Promise<void> => {
    let newest: Listed | undefined
    for (const name of listNames) {
      const bytes = await placeOf().get(name)
      if (!bytes) continue
      try {
        const read: unknown = JSON.parse(new TextDecoder().decode(bytes))
        if (isListed(read) && (!newest || read.generation > newest.generation)) newest = read
      } catch {
        // A list that was cut off while it was written is the older one: the other copy is read.
      }
    }
    if (newest) list = newest
  }

  /** Writes the list anew, into the copy that the generation names, so that one whole copy always stands. */
  const writeList = async (): Promise<void> => {
    list.generation += 1
    await placeOf().put(listNames[list.generation % 2], new TextEncoder().encode(JSON.stringify(list)))
  }

  const load = (): Promise<void> => {
    loaded ??= readList()
    return loaded
  }

  /** The changes of a file of a part as the disk holds it. */
  const changesOfFile = (path: string): SinkChange[] => changesIn(new Uint8Array(readFileSync(path)), path)

  /** The parts that wait to be sent, the oldest first: by the moment of their first change, and then its number. */
  const waitingParts = (): { path: string; changes: SinkChange[] }[] => {
    if (!existsSync(local)) return []
    return readdirSync(local)
      .filter((name) => name.startsWith(waits))
      .map((name) => ({ path: join(local, name), changes: changesOfFile(join(local, name)) }))
      .filter((one) => one.changes.length > 0)
      .sort((a, b) => a.changes[0].at - b.changes[0].at || a.changes[0].n - b.changes[0].n)
  }

  /** Closes the part that is open: it waits to be sent, and the next change opens a part anew. */
  const closeOpen = (): void => {
    let head = open?.head
    if (open) closeSync(open.file)
    open = undefined
    if (!existsSync(openFile)) return
    if (!head) {
      // A part that a stop left open: a stop in the middle of an append left the last change cut off, which never
      // reached the archive, so the part is cut to its whole changes before it waits to be sent.
      const bytes = new Uint8Array(readFileSync(openFile))
      const whole = wholeChangesIn(bytes)
      if (whole.size < bytes.length) truncateSync(openFile, whole.size)
      head = whole.changes[0]
    }
    if (head) renameSync(openFile, join(local, `${waits}${head.n}-${head.at}.changes`))
    else rmSync(openFile, { force: true })
  }

  /** Sends each part that waits, in order, whole, and writes it into the list. A part that fails waits for the next time. */
  const send = (): Promise<void> =>
    then(async () => {
      await load()
      for (const waiting of waitingParts()) {
        const bytes = new Uint8Array(readFileSync(waiting.path))
        const head = waiting.changes[0]
        const tail = waiting.changes[waiting.changes.length - 1]
        const print = fingerprintOf(bytes)
        // The list is the truth of what was sent: a part it names, which a stop caught before its file was
        // removed, is not sent again.
        if (list.parts.some((one) => one.print === print && one.from === head.n && one.fromAt === head.at)) {
          rmSync(waiting.path, { force: true })
          continue
        }
        let name = `${head.n}-${head.at}.changes`
        for (let again = 1; list.parts.some((one) => one.name === name); again++)
          name = `${head.n}-${head.at}-${again}.changes`
        await placeOf().put(name, bytes)
        list.parts.push({ name, from: head.n, to: tail.n, fromAt: head.at, toAt: tail.at, print })
        list.last = { n: tail.n, at: tail.at }
        await writeList()
        rmSync(waiting.path, { force: true })
      }
      // With the archive in a store nothing of it stays beside the backups once all is sent.
      if (placeOf().stored && !open && !waitingParts().length) rmSync(local, { recursive: true, force: true })
    }, 'send a part')

  /** Takes the backup that a gap asks for, once the app is the writer that stands open. */
  const backUp = (): void => {
    if (!backupOwed || !up || closed) return
    backupOwed = false
    backingUp = import('../backups.ts')
      .then(({ takeBackup }) => takeBackup(o))
      .then(
        () => undefined,
        (error: unknown) =>
          line('error', 'The backup that a gap of the archive asks for failed.', { error: String(error) }),
      )
  }

  const sink: ChangeSink = {
    records: true,
    async start(n) {
      // A part that a stop left open is closed, and sent with every part that waits.
      closeOpen()
      await load()
      await queue
      const held = [list.last, ...waitingParts().map((one) => one.changes[one.changes.length - 1])]
        .filter((one) => one !== undefined)
        .sort((a, b) => a.at - b.at)
        .at(-1)
      // The data stands past the newest change the archive holds: the writes between never reached it.
      if (held && held.n < n) {
        const gap: Gap = { from: held.n + 1, to: n, after: held.at, at: o.clock.now() }
        list.gaps = [...(list.gaps ?? []), gap]
        await then(writeList, 'write down a gap')
        line('error', 'Writes never reached the archive: a backup is taken at once.', gap)
        backupOwed = true
        backUp()
      }
      void send()
      return { n, all: true }
    },
    wrote(change) {
      if (closed) return
      const bytes = changeBytes(change)
      if (!open) {
        mkdirSync(local, { recursive: true })
        open = { file: openSync(openFile, 'a'), head: { n: change.n, at: change.at }, size: 0 }
      }
      // Each change reaches the file as it comes: a stop of the program loses none that was written.
      writeSync(open.file, bytes)
      open.size += bytes.length
      if (open.size >= partSize) {
        closeOpen()
        void send()
      }
    },
  }

  /** Throws for a gap that lies between two moments: a write that never reached the archive may have been made then. */
  const heldBetween = (from: number, until: number): void => {
    const gap = (list.gaps ?? []).find((one) => from <= one.at && until >= one.after)
    if (gap) throw inGap(gap)
  }

  const archive: Archive = {
    sink,
    started() {
      up = true
      backUp()
    },
    backedUp(backup, kept) {
      return then(async () => {
        await load()
        const entry: Rested = { name: backup.name, n: backup.n, at: backup.at }
        if (placeOf().stored) {
          const path = join(folder, backup.name)
          const files = statSync(path).isDirectory() ? filesUnder(path) : ['.']
          for (const file of files)
            await placeOf().put(`backups/${backup.name}/${file}`, new Uint8Array(await readFile(join(path, file))))
          entry.files = files
        }
        list.backups.push(entry)
        const gone = list.backups.filter((one) => !kept.includes(one.name))
        list.backups = list.backups.filter((one) => kept.includes(one.name))
        // A moment the data was put back at, from before the oldest kept backup, divides nothing that is kept.
        const first = Math.min(...list.backups.map((one) => one.at))
        list.restores = (list.restores ?? []).filter((one) => one.at >= first)
        for (const one of gone)
          for (const file of one.files ?? []) await placeOf().remove(`backups/${one.name}/${file}`)
        // A part whose last change is older than the oldest kept backup is needed by no restore.
        const oldest = Math.min(...list.backups.map((one) => one.at))
        const old = list.parts.filter((one) => one.toAt < oldest)
        list.parts = list.parts.filter((one) => one.toAt >= oldest)
        await writeList()
        for (const one of old) await placeOf().remove(one.name)
      }, 'write down a backup')
    },
    restored(put) {
      return then(async () => {
        await load()
        list.restores = [...(list.restores ?? []), put]
        await writeList()
      }, 'write down that the data was put back')
    },
    async backups() {
      await load()
      await queue
      return {
        backups: [...list.backups].sort((a, b) => a.at - b.at),
        restores: [...(list.restores ?? [])].sort((a, b) => a.at - b.at),
      }
    },
    async changesAfter(backup, from, until) {
      const found: SinkChange[] = []
      await archive.eachBetween(from, until, (change) => {
        if (change.n > backup.n) found.push(change)
      })
      return found
    },
    async eachBetween(from, until, take) {
      await load()
      await queue
      heldBetween(from, until)
      const held = (change: SinkChange): boolean => change.at >= from && change.at <= until
      for (const part of list.parts) {
        if (part.toAt < from || part.fromAt > until) continue
        const bytes = await placeOf().get(part.name)
        if (!bytes) throw new Error(`The part \`${part.name}\` of the archive is not there.`)
        if (part.print !== undefined && fingerprintOf(bytes) !== part.print)
          throw new TentError('T0009', `The part \`${part.name}\` of the archive is not the one that was sent.`)
        for (const change of changesIn(bytes, part.name)) if (held(change)) take(change)
      }
      // What waits to be sent, and the part that is open, are read where they lie.
      const waiting = [...waitingParts().map((one) => one.changes), existsSync(openFile) ? changesOfFile(openFile) : []]
      for (const changes of waiting) for (const change of changes) if (held(change)) take(change)
    },
    async fetched(backup, into) {
      const local = join(folder, backup.name)
      if (existsSync(local)) return local
      await load()
      // A backup of the files of tenants names the backups beside it that hold the files it did not copy.
      const names = new Set([backup.name])
      const lay = async (one: Rested): Promise<void> => {
        for (const file of one.files ?? []) {
          const bytes = await placeOf().get(`backups/${one.name}/${file}`)
          if (!bytes) throw new Error(`The store holds no copy of \`${file}\` of the backup \`${one.name}\`.`)
          const to = file === '.' ? join(into, one.name) : join(into, one.name, file)
          mkdirSync(dirname(to), { recursive: true })
          writeFileSync(to, bytes)
        }
      }
      await lay(backup)
      const listFile = join(into, backup.name, 'files.json')
      if (existsSync(listFile)) {
        const named: unknown = JSON.parse(await readFile(listFile, 'utf8'))
        for (const entry of Array.isArray(named) ? named : []) names.add(String(Object(entry).backup))
        for (const name of names) {
          const other = list.backups.find((one) => one.name === name)
          if (other && other !== backup && !existsSync(join(into, name))) await lay(other)
        }
      }
      return join(into, backup.name)
    },
    async close() {
      if (closed) return
      closed = true
      await backingUp
      // The part that is open is sent whole: what a send that failed leaves waits for the next start.
      closeOpen()
      await send()
    },
  }
  archives.set(o, archive)
  return archive
}
