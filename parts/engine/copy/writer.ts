import type { Change, Wrote } from '../../data/index.ts'
import { epochIn, here, keepChanges } from '../../data/index.ts'
import { epochNumber, epochOf, heldBy, manyLimit, namesWriter } from '../held.ts'
import type { Opened } from '../opened.ts'
import { fileStore } from '../stored/files.ts'
import { filesAdded } from './fileBytes.ts'
import type { ReaderKey } from './keys.ts'
import { holdsReaderKeys } from '../keys/readerKeys.ts'
import type { Link } from './link.ts'
import { messageOf, tell } from './link.ts'
import { copyParts } from '../ai/told.ts'
import { runsOut } from './runsCopied.ts'
import { gaveWay, writerHeardOf, tookTold } from './otherWriter.ts'
import { readerPlaced } from './placing.ts'
import { afterLoss } from './restored.ts'
import { settlingOf } from './settling.ts'
import { valuesTold } from './valued.ts'
import { versionsTold } from './versions.ts'
import type { JoinedReader, WriterState, Writes } from './writerState.ts'
import { beatOf, behindOf, writerLine, writerWritesNow } from './writerState.ts'
import { countedFrom } from '../counts/batches.ts'
import { spansFrom } from '../trace/away.ts'
import { countedLink } from '../counts/links.ts'

/** One machine of an app, as `app.machines` gives it. */
export interface MachineRow {
  id: string
  role: 'writer' | 'reader'
  far: boolean
  take: boolean
  own?: string
  address?: string
  key?: string
  n: number
  current: boolean
  ahead?: number
  since: number
}

/** The writer of an app: its links, what is settled, and what it answers the machines that reach it. */
export interface Writer {
  readonly keys: ReaderKey[]
  readonly own: string | undefined
  n(): number
  settled(): number
  epoch(): string
  state(): Writes
  /** Whether the app has a lease, which the writer asks. */
  leases(): boolean
  /** Answers once the writer takes writes and lets answers leave: at once, but for one that opened with near readers. */
  ready(): Promise<void>
  /** Takes the link that a reader opened with a key, from an address. */
  join(link: Link, key: ReaderKey, address: string): void
  /**
   * Is told each committed write, and hands it to every reader. `own` says that the engine made it by itself, as
   * the pass that brings files up does: it is no write of the app.
   */
  wrote(change: Change, own?: boolean): void
  /** Is told the rows of tables kept in memory that a committed write wrote, and hands them to every reader. */
  memory(rows: Wrote[]): void
  /** A key of a reader was made since it opened: its writes are kept from here on, and it stands where its data does. */
  keepsFrom(): void
  /** Answers once a write is settled, or with `all` once every reader that is waited for holds it. */
  held(n: number, all: boolean): Promise<void>
  /** Tells every reader the settings of the app anew, and answers once each uses them or is cut off for too long. */
  valued(): Promise<void>
  rows(): MachineRow[]
  farJoined(): boolean
  /** What a machine that took over told: answers nothing where this writer gives way, and the other epoch otherwise. */
  took(told: { epoch: string; own?: string }, key: ReaderKey): { other: string; own?: string } | undefined
  /** Gives way to a machine that took over under a newer epoch: this writer stops for good, and says so on every link. */
  giveWay(told: { epoch: string; own?: string }): void
  /** Is told an epoch that a machine named and that is newer than its own, with the address of that machine where it told one: it goes on, and says so. */
  heard(epoch: string, own?: string): void
  /** The newest other writer that this one heard of since it opened, and of a stopped writer the one that stopped it. */
  other(): { epoch: string; own?: string } | undefined
  /**
   * The lease of the writer: whether it holds one until that moment, where the app has a lease at all, and what
   * asks the lease again.
   */
  leased(until: number | undefined, renew: () => Promise<void>): void

  /** Tells every reader the versions that can be loaded now: one was added, dropped, or made the running one. */
  toldVersions(): void
  /**
   * Answers once every reader that is joined holds a version. A reader that does not within `versionWait`, counted
   * from the list that first named the version to it, has its link closed, and is waited for no longer.
   */
  versionHeld(version: string): Promise<void>
  /** Is told how long a reader could be behind under the version that ran until now: it waits by the longer time for that long. */
  switched(behindBefore: number): void
  /** No reader's place fits from now on: the data was put back, and each reader fetches it anew. */
  gaveUp(): void
  /** Whether it lost writes of its shared file to a power cut, and has not gone on since. */
  lost(): boolean
  /** A writer that stood back goes on with what it holds. */
  goOn(): void
  /** Tells every reader what the runner told of a run, after what of its runs still waits to cross. */
  runs(message: object): void
  close(): void
}

/** The messages that a reader may send, by their names. */
const fromReader = ['from', 'at', 'beat', 'ready', 'valued', 'list', 'has', 'used', 'counted', 'spans', 'no']

/**
 * Takes what the engine holds of an app, the keys of its readers, and the address by which they reach it. Answers
 * the writer of the app: it takes the links of its readers, hands each committed write to every one of them,
 * answers their beats, and says what it is among the machines. Whether the place of a reader fits, what is
 * settled, and what it does where another writer is heard of, are made in files of their own.
 */
export function writerOf(o: Opened, keys: ReaderKey[], own: string | undefined): Writer {
  const mine = here(o.store)
  // A file that a writer hands out names the writer of its epoch: one that names none yet is given this machine.
  const keyed = keys.length > 0 || holdsReaderKeys(o)
  if (keyed && mine.role !== 'stopped' && !namesWriter(o.store)) o.store.write((tx) => epochIn(tx, mine.id))
  // Where numbers are missing between its kept changes and the number that a file holds, the shared file lost
  // writes to a power cut: the writer counts as holding the number below the first missing one.
  const lost = o.tenantFiles?.lost()
  const w: WriterState = {
    o,
    id: mine.id,
    own,
    opened: o.clock.now(),
    links: new Map<string, JoinedReader>(),
    n: lost === undefined ? heldBy(o) : lost - 1,
    epoch: epochOf(o.store),
    lost,
    back: mine.back,
    stopped: mine.role === 'stopped' ? mine.stopped : undefined,
    givenUp: mine.restored === undefined ? undefined : epochNumber(mine.restored),
    wroteSince: false,
    closed: false,
    other: undefined,
    leaseUntil: undefined,
    leaseAsked: false,
    asks: undefined,
  }
  const settling = settlingOf(w, mine.near ?? [], lostNoMore)

  const machines = (): MachineRow[] => [
    {
      id: w.id,
      role: 'writer',
      far: false,
      take: true,
      ...(own ? { own } : {}),
      n: w.n,
      current: true,
      since: w.opened,
    },
    ...[...w.links.values()].map((one): MachineRow => {
      const held = settling.beatsHeld(one.id)
      const at = held?.at ?? 0
      const last = held?.oks.at(-1)
      return {
        id: one.id,
        role: 'reader',
        far: one.far,
        take: !one.key.far,
        ...(one.own ? { own: one.own } : {}),
        address: one.address,
        key: one.key.id,
        n: at,
        current: last !== undefined && at >= last.n && o.clock.now() < last.time + behindOf(w),
        ...(at > w.n ? { ahead: at - w.n } : {}),
        since: one.since,
      }
    }),
  ]

  const tellMachines = (): void => {
    const list = machines()
    for (const one of w.links.values()) tell(one.link, { t: 'machines', list })
  }

  /** A writer that lost writes and stands back for nobody goes on with what it holds, under a new epoch. */
  function lostNoMore(): void {
    if (w.lost === undefined || settling.holds() || w.back || w.stopped || w.closed) return
    // The write that begins the new epoch is told to this writer as any commit is: by then it has lost nothing.
    w.lost = undefined
    afterLoss(o)
    goOn()
  }

  function goOn(): void {
    w.lost = undefined
    w.back = undefined
    w.n = heldBy(o)
    w.epoch = epochOf(o.store)
    settling.allSettled(false)
    for (const one of [...w.links.values()]) one.link.close()
  }

  /** Sends one change to one reader: the change without its record as a text, and then the record. */
  const send = (link: Link, change: Change): void => {
    const { record, ...rest } = change
    tell(link, { t: 'wrote', change: rest, settled: settling.settled() })
    link.send(record)
  }

  /** Answers the beat of a reader, with whether it can make the reader current. */
  function beaten(joined: JoinedReader, id: unknown): void {
    const held = settling.beatsOf(joined.id, joined.far)
    const ok = joined.beatAt !== undefined && held.at >= joined.beatAt && writerWritesNow(w) === 'writes'
    if (ok) {
      // The id of a near reader that may be current has reached the disk before its beat is answered.
      if (!joined.far) settling.nearFrom(joined.id)
      held.oks.push({ time: o.clock.now(), n: w.n })
      if (held.oks.length > 32) held.oks.shift()
    }
    joined.beatAt = w.n
    tell(joined.link, {
      t: 'beat',
      id,
      n: w.n,
      settled: settling.settled(),
      epoch: w.epoch,
      ok,
      beat: beatOf(w),
      behind: behindOf(w),
    })
  }

  const heard = (theirs: string, theirOwn?: string): void => writerHeardOf(w, theirs, theirOwn)

  /** Tells one reader the versions that can be loaded, and notes when each was first named to it. */
  function versions(joined: JoinedReader): void {
    const list = versionsTold(o)
    const now = o.clock.now()
    for (const one of list) if (!joined.named.has(one.version)) joined.named.set(one.version, now)
    tell(joined.link, { t: 'versions', list })
  }

  /** Answers what waits for a reader to hold a version: it holds it, or its link is closed. */
  function readyNow(joined: JoinedReader, version?: string): void {
    const done = joined.waits.filter((one) => version === undefined || one.version === version)
    joined.waits = joined.waits.filter((one) => !done.includes(one))
    for (const one of done) one.done()
  }

  const asks = { lostNoMore, heard, machines, send, versions }
  // What the runs tell crosses to every reader, for the pages that follow them there.
  const runsCrossing = runsOut(o, (message) => {
    for (const one of w.links.values()) tell(one.link, message)
  })
  copyParts(o, (run, part) => runsCrossing.part(run, part))
  // The settings of the app are told to each reader when it joins, and to every reader when one changes.
  const values = valuesTold(o)

  return {
    keys,
    own,
    n: () => w.n,
    settled: () => settling.settled(),
    epoch: () => w.epoch,
    state: () => writerWritesNow(w),
    leases: () => w.leaseAsked,
    async ready() {
      // A writer whose last yes ran out asks its lease again before it takes a write, and does not wait for its beat.
      if (w.leaseAsked && (w.leaseUntil ?? 0) < o.clock.now() && !w.stopped && !w.back) await w.asks?.()
      await settling.ready()
    },

    join(given, key, address) {
      // What the link of a reader carries is counted under `copy`, as its bytes.
      const link = countedLink(o, 'copy', given)
      let joined: JoinedReader | undefined
      link.each(
        (frame) => {
          // What arrives once the writer is closed is taken no more: its data is closed with it.
          if (w.closed) return
          const message = typeof frame === 'string' ? messageOf(frame) : undefined
          // A frame that is no message, and a message that a reader may not send, closes the link.
          if (!message || !fromReader.includes(message.t) || (!joined && message.t !== 'from')) {
            link.close()
            return
          }
          if (message.t === 'from') {
            const fresh = readerPlaced(w, settling, asks, link, key, address, message)
            joined = fresh ?? joined
            if (fresh && w.links.get(fresh.id) === fresh) {
              values.tell(fresh.id, fresh.link)
              // A reader that joins holds what the runs at work wrote and said so far.
              for (const one of runsCrossing.soFar()) tell(fresh.link, one)
            }
          }
          if (!joined || w.links.get(joined.id) !== joined) return
          if (message.t === 'valued') values.valued(joined.id, message.id)
          if (message.t === 'at' && typeof message.n === 'number') {
            const held = settling.beatsOf(joined.id, joined.far)
            held.at = Math.max(held.at, message.n)
            settling.settle()
          }
          // A near reader holds the bytes of a file: a write that added its row may be settled for that reader.
          if (message.t === 'has' && typeof message.file === 'string') {
            settling.has(joined.id, message.file)
            settling.settle()
          }
          if (message.t === 'beat') beaten(joined, message.id)
          if (message.t === 'counted') countedFrom(o, joined.id, message)
          if (message.t === 'spans') spansFrom(o, joined.id, message)
          if (message.t === 'list') tell(link, { t: 'machines', list: machines() })
          if (message.t === 'ready' && typeof message.version === 'string') {
            joined.ready.add(message.version)
            readyNow(joined, message.version)
          }
        },
        () => {
          // A reader whose link is closed is waited for by no switch, and by no setting.
          if (joined) readyNow(joined)
          if (joined) values.left(joined.id)
          // A writer that closes tells nothing more: its readers keep the machines as it last named them.
          if (w.closed || !joined || w.links.get(joined.id) !== joined) return
          w.links.delete(joined.id)
          const at = settling.beatsHeld(joined.id)?.at ?? 0
          o.raise('reader.left', { app: o.app, reader: joined.id, far: joined.far, n: at })
          tellMachines()
          settling.settle()
        },
      )
    },
    keepsFrom() {
      keepChanges(o.files ?? o.store)
      w.n = heldBy(o)
      w.epoch = epochOf(o.store)
    },
    memory(rows) {
      for (const one of w.links.values()) tell(one.link, { t: 'memory', rows })
    },
    wrote(change, own = false) {
      // A write of the engine's own moves nothing of what a writer that lost writes counts as holding.
      if (!own || w.lost === undefined) w.n = change.n
      if (!own) w.wroteSince = true
      if (change.epoch !== w.epoch) {
        w.epoch = change.epoch
        o.raise('writer.changed', { app: o.app, epoch: w.epoch })
      }
      // A write that adds a row of a file is settled for a near reader once that reader holds its bytes too.
      if (fileStore(o).shared !== true)
        settling.files(
          change.n,
          filesAdded(change).map((one) => one.fingerprint),
        )
      // With no near reader that is waited for, a write is settled when it is committed.
      settling.settle(true)
      for (const one of w.links.values()) send(one.link, change)
    },
    held: (write, all) => settling.held(write, all),
    // A setting that changed is answered once every reader uses it, far ones too, or is cut off for too long.
    valued: () => values.all(w.links.values(), behindOf(w)),
    rows: machines,
    farJoined: () => [...w.links.values()].some((one) => one.far),
    took: (told, key) => tookTold(w, told, key),
    giveWay: (told) => gaveWay(w, told),
    heard,
    other: () => w.stopped ?? w.other,
    leased(until, renew) {
      w.leaseAsked = true
      w.leaseUntil = until
      w.asks = renew
    },

    toldVersions() {
      for (const one of w.links.values()) versions(one)
    },
    async versionHeld(version) {
      const wait = manyLimit(o.description, 'versionWait')
      await Promise.all(
        [...w.links.values()].map(
          (joined) =>
            new Promise<void>((done) => {
              if (joined.ready.has(version) || w.links.get(joined.id) !== joined) return done()
              const waiting = {
                version,
                done() {
                  cancel()
                  done()
                },
              }
              // The time runs from the list that first named the version to this reader.
              const cancel = o.clock.setTimer((joined.named.get(version) ?? o.clock.now()) + wait, () => {
                joined.waits = joined.waits.filter((one) => one !== waiting)
                writerLine(
                  w,
                  'warn',
                  'A reader did not hold a version in time: its link is closed, and it joins again.',
                  {
                    reader: joined.id,
                    version,
                  },
                )
                // It joins again, and is not current until it holds the version.
                joined.link.close()
                done()
              })
              joined.waits.push(waiting)
            }),
        ),
      )
    },
    switched(before) {
      const now = manyLimit(o.description, 'behind')
      if (before > now) w.longer = { behind: before, until: o.clock.now() + before + beatOf(w) }
    },
    gaveUp() {
      w.n = heldBy(o)
      w.epoch = epochOf(o.store)
      w.givenUp = epochNumber(w.epoch)
      settling.allSettled(true)
      for (const one of [...w.links.values()]) {
        tell(one.link, { t: 'again', epoch: w.epoch })
        one.link.close()
      }
    },
    lost: () => w.lost !== undefined,
    goOn,
    runs(message) {
      runsCrossing.flush(Reflect.get(Object(message), 'told'))
      for (const one of w.links.values()) tell(one.link, message)
    },
    close() {
      w.closed = true
      runsCrossing.close()
      for (const one of [...w.links.values()]) one.link.close()
      settling.close()
    },
  }
}
