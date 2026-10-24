import { TentError } from '../../core/index.ts'
import type { Change } from '../../data/index.ts'
import { applyChange, applyMemory, here, isWrote, layoutOf, setHere } from '../../data/index.ts'
import { epochNumber, epochOf, manyLimit, newer, placeOf, versionOf } from '../held.ts'
import type { Opened } from '../opened.ts'
import { holdVersion, keepVersions } from '../versions.ts'
import { currencyOf } from './current.ts'
import { diallingOf } from './dialling.ts'
import { asked } from './fetch.ts'
import type { FileBytes } from './fileBytes.ts'
import { bytesLeft, bytesOfFiles, fetchBytes, filesAdded, filesHeld, filesLeaving } from './fileBytes.ts'
import { holdsBytes } from '../stored/files.ts'
import type { Frame } from './link.ts'
import { messageOf, tell } from './link.ts'
import { markOf, neededBy } from './marks.ts'
import type { Reached } from './reach.ts'
import { notReached } from './reach.ts'
import type { Open, ReaderState } from './readerState.ts'
import { readerLine } from './readerState.ts'
import { refetched } from './refetch.ts'
import { takeValues } from './valued.ts'
import { fetchVersion, holdsVersion, isTold, runVersion } from './versions.ts'
import { waitersOf } from './waiters.ts'
import type { MachineRow } from './writer.ts'
import { countsToWriter } from '../counts/batches.ts'
import { spansToWriter } from '../trace/away.ts'
import { followRelease } from '../gradual/release.ts'
import { runOnReader } from './runsCopied.ts'

/** What a reader is started with: its writer, its key, its kind, and the address the other machines reach it by. */
export interface Reads {
  from: string
  key: string
  far: boolean
  own?: string
  // The folder was a writer's: it goes on as a reader only once it has reached a writer of a newer epoch.
  returning?: boolean
}

/** A reader of an app: its link to the writer, what it applied, and whether it may answer. */
export interface Reader {
  readonly reads: Reads
  applied(): number
  settled(): number
  epoch(): string
  /** The epoch that the writer named when the link was opened, or nothing while no link is open. */
  linked(): string | undefined
  /** The address that its link is open to, or the one it tries first. */
  writer(): string
  /** Fetches the bytes of a file from its writer, and keeps them. Throws T0029 where the writer is not reached. */
  fetchFile(file: FileBytes): Promise<void>
  current(): boolean
  /** Whether it holds the whole data of a writer it follows: not while it fetches, and not while a writer's folder waits for a newer writer. */
  whole(): boolean
  /** Since when it was not current, or nothing while it is; and when its writer last answered it a beat. */
  since(): { behind?: number; beat?: number }
  rows(): MachineRow[]
  /** The addresses of the other machines that may take over, as its writer last named them: kept in its data over a start. */
  takes(): string[]
  /** Asks its writer for the machines, and answers them: what it last held where the writer is not reached. */
  ask(): Promise<MachineRow[]>
  /** Answers whether it has applied a write within that time. */
  untilApplied(n: number, ms: number): Promise<boolean>
  /** Answers whether it was told within that time that a write is settled. */
  untilSettled(n: number, ms: number): Promise<boolean>
  /**
   * Takes what a watch says its page has seen, a mark. Answers once this reader holds it, or has applied the
   * number in the answer to a beat that it sent after the asking, and nothing where it holds it already. A mark
   * that does not read is taken as a write that no machine holds.
   */
  sees(seen: unknown): Promise<void> | undefined
  start(): void
  close(): void
}

const isChange = (value: unknown): value is Omit<Change, 'record'> => {
  const held = Object(value)
  return (
    typeof held.n === 'number' &&
    typeof held.epoch === 'string' &&
    typeof held.at === 'number' &&
    typeof held.sum === 'string' &&
    Array.isArray(held.rows)
  )
}

const isRows = (list: unknown): list is MachineRow[] =>
  Array.isArray(list) && list.every((one) => typeof Reflect.get(Object(one), 'id') === 'string')

/**
 * Takes what the engine holds of an app whose data folder is a reader's, what the reader was started with, and
 * what reaches an address. Answers the reader. Once started it opens its link, applies each change that its
 * writer sends as one write of its own store, sends its beats, and looks for the writer again where its link is
 * lost, until it is closed. How it dials its writer, whether it is current, what waits on it, and how it fetches
 * the data anew are made in files of their own.
 */
export function readerOpened(o: Opened, reads: Reads, reached: (address: string) => Reached): Reader {
  // What a data folder that was a writer's holds of itself once it is a reader.
  const asReader = {
    from: reads.from,
    far: reads.far ? (true as const) : undefined,
    own: reads.own,
    kept: undefined,
    near: undefined,
    took: undefined,
    back: undefined,
    stopped: undefined,
  }
  const r: ReaderState = {
    o,
    reads,
    reached,
    returning: reads.returning === true,
    applied: placeOf(o).n,
    held: epochOf(o.store),
    settled: 0,
    open: undefined,
    named: undefined,
    machines: [],
    takes: here(o.store).take ?? [],
    limits: { beat: manyLimit(o.description, 'beat'), behind: manyLimit(o.description, 'behind') },
    closed: false,
    busy: false,
    lacking: false,
    bytesLacking: new Map<string, { file: FileBytes; n: number }>(),
    sent: new Map<number, number>(),
    work: Promise.resolve(),
  }
  let beatId = 0
  let cancelBeat = (): void => undefined
  const asking: ((rows: MachineRow[]) => void)[] = []
  const currency = currencyOf(r)
  const waiters = waitersOf(r)
  const dial = diallingOf(r, taken)
  const refetch = (keep: boolean, address: string): Promise<void> =>
    refetched(r, currency, waiters, dial, keep, address)

  /** Keeps the addresses of the machines that may take over, as the writer just named them, in the data where they changed. */
  function noteTakes(): void {
    const { id } = here(o.store)
    const named = r.machines.flatMap((one) => (one.take && one.own && one.id !== id ? [one.own] : []))
    if (named.length === r.takes.length && named.every((one, i) => one === r.takes[i])) return
    r.takes = named
    setHere(o.store, { take: named.length ? named : undefined })
  }

  /** What asks the writer at an address for one of the addresses of the link. */
  const askOf =
    (address: string) =>
    (path: string): Promise<Response> =>
      asked(reached(address), address, path, reads.key)
  // Whether the bytes that this reader lacks are being fetched.
  let filling = false

  /**
   * Fetches the bytes that this near reader lacks, and tells the writer of each that it holds now. With `all`, as
   * when its link opened, every row of a file that it holds is looked at first.
   */
  async function filled(mine: Open, all: boolean): Promise<void> {
    if (filling || reads.far) return
    filling = true
    try {
      if (all)
        for (const file of filesHeld(o))
          if (!r.bytesLacking.has(file.fingerprint) && !(await holdsBytes(o, file.fingerprint)))
            r.bytesLacking.set(file.fingerprint, { file, n: 0 })
      const wanted = [...r.bytesLacking.values()].map((one) => one.file)
      const { held } = await bytesOfFiles(o, wanted, askOf(mine.address))
      for (const file of held) {
        r.bytesLacking.delete(file)
        if (r.open === mine) tell(mine.link, { t: 'has', file })
      }
    } finally {
      filling = false
      currency.current()
    }
  }

  /** Applies one change of the writer as one write of this store, and says so. */
  async function apply(mine: Open, change: Change, toldSettled: unknown): Promise<void> {
    if (change.n !== r.applied + 1 || newer(r.held, change.epoch)) return dial.reopen()
    // The bytes of a file whose last row leaves are removed once the change is applied.
    let leaving: string[] = []
    try {
      leaving = filesLeaving(o, change)
      if (o.tenantFiles) {
        // A change of a tenant's file is put into that file, and a file that is to be fetched is fetched.
        const [{ applyToFiles }, { fetching }] = await Promise.all([
          import('../files/following.ts'),
          import('../files/reading.ts'),
        ])
        await applyToFiles(o, o.tenantFiles, change, fetching(reached(mine.address), mine.address, reads.key))
        // A change of the shared file may note a move of rows, or end one: the files follow its layout.
        if (!change.file) (await import('../files/moving.ts')).followMove(o, o.tenantFiles)
      } else applyChange(o.store, change)
    } catch (error) {
      if (error instanceof TentError && error.code === 'T0033') return refetch(true, mine.address)
      readerLine(r, 'error', 'A change of the writer could not be applied.', { n: change.n, error: String(error) })
      return dial.reopen()
    }
    r.applied = change.n
    if (change.all) for (const table of o.store.layout()) o.store.forget(table.name)
    if (change.epoch !== r.held) {
      r.held = change.epoch
      o.raise('writer.changed', { app: o.app, epoch: r.held })
    }
    // A change that brought another running version is followed before the reader says that it holds the change.
    const version = versionOf(o.store)
    if (version !== undefined && version !== o.version) {
      r.lacking = true
      currency.current()
      if (!holdsVersion(o.dataFolder, version)) return dial.reopen()
      await runVersion(o, version)
      r.lacking = false
    }
    for (const row of change.rows)
      if (!row.table.startsWith('_t_'))
        o.raise('row.changed', { app: o.app, table: row.table, id: String(row.row.id), kind: row.kind })
    if (typeof toldSettled === 'number') r.settled = Math.max(r.settled, toldSettled)
    toldHub(change)
    await bytesLeft(o, leaving)
    // The bytes of each file whose row came are fetched, and the writer is told that they are here. Those that
    // could not be fetched are lacked, and keep the reader from being current once their write is settled.
    if (!reads.far) {
      const { held, lacking } = await bytesOfFiles(o, filesAdded(change), askOf(mine.address))
      for (const file of held) if (r.open === mine) tell(mine.link, { t: 'has', file })
      for (const file of lacking) r.bytesLacking.set(file.fingerprint, { file, n: change.n })
    }
    if (r.open === mine) tell(mine.link, { t: 'at', n: r.applied })
    waiters.woken()
  }

  /**
   * Tells the hub of this machine what an applied change touched, as a write of its own would: the rows it names,
   * the tables of a write whose rows are not known, and every group for a write that states neither.
   */
  function toldHub(change: Change): void {
    const { hub } = o
    if (!hub) return
    const { file } = change
    const rows = new Map<string, string[]>()
    for (const { table, row } of change.rows) rows.set(table, [...(rows.get(table) ?? []), String(row.id)])
    for (const table of change.tables ?? []) rows.set(table, [])
    // A change of a tenant's file names its file with each table. One that names no table, or whose tables are
    // not known, touches whatever was read in that file.
    if (file && (change.all || !rows.size)) return void hub.wrote([{ table: '', ids: [], file }], false)
    hub.wrote(
      [...rows].map(([table, ids]) => ({ table, ids, ...(file ? { file } : {}) })),
      change.all === true,
    )
  }

  /** Fetches each version that the writer told and this machine lacks, and says which it holds. */
  async function versions(mine: Open, list: unknown): Promise<void> {
    if (!isTold(list)) return mine.link.close()
    for (const told of list) {
      try {
        if (!holdsVersion(o.dataFolder, told.version)) {
          const blob = async (fingerprint: string): Promise<Uint8Array> =>
            new Uint8Array(
              await (
                await asked(reached(mine.address), mine.address, `/_t/copy/blob/${fingerprint}`, reads.key)
              ).arrayBuffer(),
            )
          await fetchVersion(o.dataFolder, told, blob)
        }
      } catch (error) {
        readerLine(r, 'error', 'A version of the writer could not be fetched.', {
          version: told.version,
          error: String(error),
        })
        continue
      }
      try {
        // It is loaded as `app.add` loads it, so that a page of it is served here before it runs.
        await holdVersion(o, told.version)
        if (r.open === mine) tell(mine.link, { t: 'ready', version: told.version })
      } catch (error) {
        // The writer says of this reader that it did not hold the version in time: here is why.
        readerLine(r, 'error', 'A version of the writer cannot be loaded on this reader: it is never ready here.', {
          version: told.version,
          error: String(error),
          fix: 'Run the engine that the version was built for on this machine too.',
        })
      }
    }
    // A version that the list names no more can be loaded no more here either.
    if (r.open === mine) keepVersions(o, new Set(list.map((told) => told.version)))
    // A release that the writer decides is followed here: each caller is given the version the writer gives it.
    if (r.open === mine) followRelease(o, list)
  }

  function taken(mine: Open, frame: Frame): void {
    r.work = r.work
      .then(() => (r.open === mine ? one(mine, frame) : undefined))
      .catch((error) => readerLine(r, 'error', 'A frame of the link could not be taken.', { error: String(error) }))
  }

  async function one(mine: Open, frame: Frame): Promise<void> {
    mine.heard = o.clock.now()
    if (typeof frame !== 'string') {
      const change = mine.coming
      const toldSettled = mine.settledWith
      mine.coming = undefined
      if (!change) return mine.link.close()
      return apply(mine, { ...change, record: frame }, toldSettled)
    }
    const message = messageOf(frame)
    if (!message || mine.coming) return mine.link.close()
    const theirs = typeof message.epoch === 'string' ? message.epoch : undefined
    // A reader obeys no writer of an older epoch than the one it holds.
    if (theirs !== undefined && newer(r.held, theirs) && ['go', 'again', 'ahead'].includes(message.t)) {
      tell(mine.link, { t: 'no', code: 'T0030' })
      r.open = undefined
      mine.link.close()
      return dial.next()
    }
    // A writer that comes back changes nothing until it reaches a writer of a newer epoch than its own.
    if (r.returning && ['go', 'again', 'ahead'].includes(message.t)) {
      if (theirs === undefined || !newer(theirs, r.held)) {
        r.open = undefined
        mine.link.close()
        return dial.next()
      }
      if (message.t === 'again') return refetch(true, mine.address)
      if (message.t === 'go') {
        setHere(o.store, { role: 'reader', ...asReader })
        r.returning = false
        readerLine(r, 'info', 'This machine was the writer, and goes on as a reader of the machine that took over.', {})
      }
    }
    switch (message.t) {
      case 'go':
        mine.go = true
        mine.epoch = theirs
        dial.joined()
        if (typeof message.beat === 'number' && typeof message.behind === 'number')
          r.limits = { beat: message.beat, behind: message.behind }
        if (typeof message.settled === 'number') r.settled = Math.max(r.settled, Math.min(message.settled, r.applied))
        countsToWriter(o, mine.link, message.counting)
        spansToWriter(o, mine.link)
        if (o.tenantFiles) {
          // A file that a stop left owed a fetch is fetched from here on, before this reader can be current.
          const [{ fetchOwed }, { fetching }] = await Promise.all([
            import('../files/following.ts'),
            import('../files/reading.ts'),
          ])
          fetchOwed(o, o.tenantFiles, fetching(reached(mine.address), mine.address, reads.key))
        }
        // A near reader holds the bytes of every file it holds a row of before it can be current.
        void filled(mine, true)
        beat()
        return
      case 'again':
        return refetch(message.keep === true, mine.address)
      case 'ahead':
        readerLine(r, 'warn', 'This reader holds more writes than its writer, which stands back.', {
          fix: 'Run `tent take-over` on the machine that is to go on.',
        })
        return
      case 'other-id':
        // Another reader is joined under this machine id: the data folder was copied, and this one takes a new id.
        setHere(o.store, { id: undefined })
        r.open = undefined
        mine.link.close()
        return dial.next()
      case 'no':
        if (typeof message.writer === 'string') dial.namedWriter(message.writer, mine.address)
        if (message.code === 'T0034')
          readerLine(r, 'error', 'This reader and its writer run stores of two shape numbers.', {
            fix: 'Run one engine on every machine, the writer first.',
          })
        return
      case 'wrote':
        if (!isChange(message.change)) return mine.link.close()
        mine.coming = message.change
        mine.settledWith = message.settled
        return
      case 'settled':
        if (typeof message.n === 'number') r.settled = Math.max(r.settled, message.n)
        return waiters.woken()
      case 'beat': {
        const at = r.sent.get(Number(message.id))
        r.sent.delete(Number(message.id))
        currency.beatAnswered()
        if (typeof message.n === 'number') waiters.beaten(Number(message.id), message.n)
        if (typeof message.settled === 'number') r.settled = Math.max(r.settled, message.settled)
        if (typeof message.beat === 'number' && typeof message.behind === 'number')
          r.limits = { beat: message.beat, behind: message.behind }
        if (message.ok === true && at !== undefined && typeof message.n === 'number') currency.ok(at, message.n)
        currency.current()
        return waiters.woken()
      }
      case 'memory':
        // The rows of a table kept in memory are kept as they came, in no record, and the live answers follow them.
        if (!Array.isArray(message.rows) || !message.rows.every(isWrote)) return mine.link.close()
        applyMemory(
          o.store,
          message.rows,
          layoutOf(o.description).filter((one) => one.memory),
        )
        o.hub?.wrote(
          message.rows.map((one) => ({ table: one.table, ids: [String(one.row.id)] })),
          false,
        )
        return
      case 'versions':
        return versions(mine, message.list)
      case 'values':
        // The settings are the writer's: this machine writes them into its own file, and uses them from now on.
        takeValues(o, message.settings)
        return tell(mine.link, { t: 'valued', id: message.id })
      case 'machines':
        if (isRows(message.list)) {
          r.machines = message.list
          noteTakes()
        }
        for (const done of asking.splice(0)) done(r.machines)
        return
      default:
        // What the runs of the writer tell is kept here, for the pages that follow them on this machine.
        if (/^run/.test(message.t)) return runOnReader(o, message)
        // What a later part of the framework sends over the link is left alone by an engine that does not know it.
        if (!/^points/.test(message.t)) mine.link.close()
    }
  }

  /** Sends a beat where the link is open, looks whether the reader is still current, and waits for the next one. */
  function beat(): void {
    if (r.closed) return
    cancelBeat()
    const now = o.clock.now()
    const mine = r.open
    if (mine?.go && r.bytesLacking.size) void filled(mine, false)
    if (mine?.go) {
      // A link that carried nothing for as long as a reader may be behind is given up, and the writer looked for anew.
      if (now - mine.heard > r.limits.behind && !currency.current()) dial.reopen()
      else {
        r.sent.set(++beatId, now)
        tell(mine.link, { t: 'beat', id: beatId })
      }
    }
    currency.current()
    cancelBeat = o.clock.setTimer(now + r.limits.beat, beat)
  }

  return {
    reads,
    applied: () => r.applied,
    settled: () => Math.min(r.settled, r.applied),
    epoch: () => r.held,
    linked: () => (r.open?.go ? r.open.epoch : undefined),
    writer: () => r.open?.address ?? r.named ?? reads.from,
    async fetchFile(file) {
      const address = r.open?.address ?? r.named ?? reads.from
      try {
        await fetchBytes(o, file, askOf(address))
      } catch (error) {
        if (error instanceof TentError && error.code === 'T0029') throw error
        throw notReached(address, `the bytes of a file could not be fetched: ${String(error)}`)
      }
      r.bytesLacking.delete(file.fingerprint)
    },
    current: currency.current,
    whole: () => !r.busy && !r.returning,
    since: currency.since,
    rows: () => r.machines,
    takes: () => r.takes,
    ask() {
      const mine = r.open
      if (!mine?.go) return Promise.resolve(r.machines)
      return new Promise((done) => {
        const cancel = o.clock.setTimer(o.clock.now() + r.limits.behind, () => done(r.machines))
        asking.push((rows) => {
          cancel()
          done(rows)
        })
        tell(mine.link, { t: 'list' })
      })
    },
    untilApplied: (n, ms) => waiters.until('applied', n, ms),
    untilSettled: (n, ms) => waiters.until('settled', n, ms),
    sees(seen) {
      const mark = markOf(typeof seen === 'string' ? seen : 'no mark')
      const needed = neededBy(mark, epochNumber(r.held), undefined)
      return r.applied >= needed ? undefined : waiters.seen(needed, beatId)
    },
    start() {
      beat()
      dial.round()
    },
    close() {
      r.closed = true
      cancelBeat()
      dial.close()
      const mine = r.open
      r.open = undefined
      mine?.link.close()
      waiters.close()
      for (const done of asking.splice(0)) done(r.machines)
    },
  }
}
