import type { Caller } from '../../core/index.ts'
import type { Change } from '../../data/index.ts'
import { here } from '../../data/index.ts'
import type { Answering } from '../door/address.ts'
import { epochOf, heldBy, manyLimit } from '../held.ts'
import type { Opened } from '../opened.ts'
import { recordTook } from '../record.ts'
import type { About } from '../web/proxy.ts'
import type { Underway } from './asked.ts'
import { underwayNow, needsWriter, noteCommit } from './asked.ts'
import type { Taken } from './door.ts'
import { answeredByMachines, carriesKey, takerOf } from './door.ts'
import { keyedBy, openLink } from './joined.ts'
import type { ReaderKey } from './keys.ts'
import type { Link } from './link.ts'
import type { Reach, Reached } from './reach.ts'
import { reachedBy } from './reach.ts'
import type { Reader, Reads } from './reader.ts'
import { readerOpened } from './reader.ts'
import type { Member } from './sentOn.ts'
import { asMachine } from './sentOn.ts'
import { takeOver } from './takeOver.ts'
import type { MachineRow, Writer } from './writer.ts'
import { writerOf } from './writer.ts'
import { notWriting } from './writerState.ts'

/** Where a machine stands: the last write it holds, the last it knows to be settled, its epoch, its running fingerprint, and whether it may answer. */
export interface At {
  n: number
  settled: number
  epoch: string
  sum: string
  current: boolean
}

/** What a machine of an app is told when it is made. */
export interface MachineTold {
  keys: ReaderKey[]
  own?: string
  insecure: boolean
  reach?: Reach
  reads?: Reads
}

/**
 * What an app is as one machine among those that hold its data: the writer, or a reader. An app on one machine is
 * a writer with no readers.
 */
export interface Machine {
  writer?: Writer
  reader?: Reader
  readonly keys: ReaderKey[]
  readonly own: string | undefined
  readonly insecure: boolean
  reached(address: string): Reached
  role(): 'writer' | 'reader'
  /** Whether the app has a reader or is one: only then does an answer wait, and say where it stands. */
  many(): boolean
  at(): At
  machines(): MachineRow[]
  /** Holds a write of the app to a machine that writes now. Throws T0030 or T0029 on any other, and on a reader the error that hands a request on. */
  writes(what: string): void
  /** Answers once what a request did may leave this machine. Throws where it may not. */
  leaves(asked: Underway): Promise<void>
  /** Makes this machine the writer of what it holds, with the readers it lets join. */
  becomeWriter(): Writer
  /** Reads what a reader added to a request that it handed on, and takes it out, before any other code is handed the request. */
  taken(request: Request, about: About): Taken
  /** Whether a request carries the key of a reader, as an address of the link is asked with one. */
  carries(request: Request): boolean
  /** Answers the key of a reader that a request for an address of the link carries. Throws T0001 where it carries none. */
  keyed(request: Request, about: About): ReaderKey
  /** Of an app on one machine: becomes the writer of a link where a request carries a key of a reader that the app holds. */
  joinable?(request: Request): Promise<void>
  /** Answers a request as the machines of the app answer it: `door` is what answers it on this machine. */
  answered<Passed extends object>(
    request: Request,
    about: About,
    began: number,
    taken: Pick<Taken, 'key' | 'ref'>,
    door: Answering<Passed>,
  ): Promise<Response>
  /** Carries a member of the app out as the machines of the app do: `work` is what carries it out on this machine. */
  sent(member: Member, args: unknown[], as: Caller, reads: boolean, work: () => unknown): Promise<unknown>
  /** Opens the link of a reader, and answers the end that the reader holds. Throws T0001 for a request with no key of a reader. */
  link(request: Request, about: About): Link
  /** What the request that is under way has done on this machine so far, or nothing where none is. */
  asked(): Underway | undefined
  /** Is told each committed write: a writer hands it to its readers, and it is noted for the request that made it. */
  noted(change: Change): void
  /** Makes this machine the writer, as `tent take-over` asks it. Answers the epoch and the number of its last write. */
  takeOver(): Promise<{ epoch: string; n: number }>
  close(): void
}

/** Takes what the engine holds of an app, and what its machine was told. Answers the machine, which is not started yet. */
export function machineOf(o: Opened, told: MachineTold): Machine {
  const reached = reachedBy(told.reach, told.insecure)
  const machine: Machine = {
    keys: told.keys,
    own: told.own,
    insecure: told.insecure,
    reached,
    role: () => (machine.reader ? 'reader' : 'writer'),
    many: () => machine.reader !== undefined || told.keys.length > 0 || here(o.store).kept === true,
    at() {
      const { sum } = here(o.store)
      const { reader, writer } = machine
      if (reader)
        return { n: reader.applied(), settled: reader.settled(), epoch: reader.epoch(), sum, current: reader.current() }
      // A writer with no reader is told no commit: where it stands is what its data holds.
      const alone = !machine.many() || !writer
      return {
        n: alone ? heldBy(o) : writer.n(),
        settled: alone ? heldBy(o) : writer.settled(),
        epoch: writer?.epoch() ?? epochOf(o.store),
        sum,
        current: true,
      }
    },
    machines() {
      const { reader, writer } = machine
      if (writer) return writer.rows()
      const told = reader?.rows() ?? []
      if (told.length) return told
      const { id } = here(o.store)
      const [n, current] = [reader?.applied() ?? 0, reader?.current() ?? false]
      return [{ id, role: 'reader', far: reader?.reads.far ?? false, take: true, n, current, since: 0 }]
    },
    writes(what) {
      if (machine.reader) throw needsWriter(what, machine.reader.writer())
      const state = machine.writer?.state() ?? 'writes'
      if (state !== 'writes') throw notWriting(state, true, machine.own)
    },
    async leaves(asked) {
      if (!machine.many()) return
      const { reader, writer } = machine
      if (reader) {
        // A reader asks again whether it is current before an answer leaves, and waits a moment for what it saw to be settled.
        const saw = reader.applied()
        if (!reader.current() || !(await reader.untilSettled(saw, manyLimit(o.description, 'catchUp'))))
          throw needsWriter('an answer that rests on a write which is not settled here')
        return
      }
      if (!writer) return
      const state = writer.state()
      if (state !== 'writes') throw notWriting(state, asked.commits.length > 0, machine.own)
      await writer.held(writer.n(), false)
      // A write that takes access away is answered once every reader holds it, the far ones too.
      for (const commit of asked.commits) if (commit.confirm || asked.everywhere) await writer.held(commit.n, true)
      // And once the place of record, where the app has one, took what the answer rests on.
      await recordTook(o)
    },
    becomeWriter() {
      machine.reader?.close()
      delete machine.reader
      machine.writer = writerOf(o, told.keys, told.own)
      return machine.writer
    },
    taken: (request, about) => takerOf(o, request, about),
    carries: (request) => carriesKey(o, request),
    keyed: (request, about) => keyedBy(o, request, about),
    answered: (request, about, began, taken, door) => answeredByMachines(o, request, about, began, taken, door),
    sent: (member, args, as, reads, work) => asMachine(o, member, args, as, reads, work),
    link: (request, about) => openLink(o, request, about),
    asked: underwayNow,
    noted(change) {
      // A write that no request and no call of a program made, and one that brings a file up or names one to
      // fetch, is the engine's own.
      const own = underwayNow() === undefined || (change.layout !== undefined && change.file !== undefined)
      machine.writer?.wrote(change, own || change.fetch === true)
      noteCommit(o.description, change)
    },
    takeOver: () => takeOver(o),
    close() {
      machine.reader?.close()
      machine.writer?.close()
    },
  }
  if (told.reads) machine.reader = readerOpened(o, told.reads, reached)
  else machine.writer = writerOf(o, told.keys, told.own)
  return machine
}
