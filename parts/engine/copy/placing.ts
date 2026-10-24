import type { Change } from '../../data/index.ts'
import { here, keptAt, keptChanges, memoryHeld, setHere } from '../../data/index.ts'
import { epochNumber, newer, placeOf, sameAddress } from '../held.ts'
import type { ReaderKey } from './keys.ts'
import type { Link } from './link.ts'
import { tell } from './link.ts'
import type { Settling } from './settling.ts'
import type { MachineRow } from './writer.ts'
import type { JoinedReader, WriterState } from './writerState.ts'
import { beatOf, behindOf, writerLine } from './writerState.ts'
import { countingTold } from '../counts/batches.ts'

/** What the placing of a reader asks of its writer. */
export interface Placing {
  /** Has a writer that lost writes go on, once it stands back for nobody. */
  lostNoMore(): void
  /** Is told an epoch that a machine named and that is newer than the writer's own. */
  heard(epoch: string): void
  /** Every machine of the app, as the writer knows them. */
  machines(): MachineRow[]
  /** Sends one change to one reader. */
  send(link: Link, change: Change): void
  /** Tells one reader the versions that can be loaded. */
  versions(joined: JoinedReader): void
}

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

/**
 * Takes what a writer holds of itself, what is settled on it, what it is asked for, the link of a reader with its
 * key and the address it came from, and the place that the reader told. Answers the reader that told its place:
 * it goes on from there, and is answered as a reader that joined, or it fetches the data anew, or it is told why
 * not, and nothing is answered. A writer that still holds its writes after opening stands back for a near reader
 * of its own epoch that holds more.
 */
export function readerPlaced(
  w: WriterState,
  settling: Settling,
  asks: Placing,
  link: Link,
  key: ReaderKey,
  address: string,
  told: Record<string, unknown>,
): JoinedReader | undefined {
  const { o } = w
  const [id, theirs, sum] = [text(told.id) ?? '', text(told.epoch) ?? '', text(told.sum) ?? '']
  const at = typeof told.n === 'number' ? told.n : -1
  const refuse = (message: object): undefined => {
    tell(link, message)
    link.close()
    return undefined
  }
  if (w.stopped) return refuse({ t: 'no', code: 'T0030', ...(w.stopped.own ? { writer: w.stopped.own } : {}) })
  asks.lostNoMore()
  const layout = o.store.version().layout
  if (told.layout !== layout) {
    writerLine(w, 'error', 'A reader runs a store of another shape number than this writer.', {
      reader: id,
      theirs: told.layout,
      ours: layout,
      fix: 'Run one engine on every machine, the writer first.',
    })
    return refuse({ t: 'no', code: 'T0034' })
  }
  const other = w.links.get(id)
  if (other && other.key.id !== key.id) {
    tell(link, { t: 'other-id' })
    return undefined
  }
  if (newer(theirs, w.epoch)) {
    asks.heard(theirs)
    return refuse({ t: 'no', code: 'T0030' })
  }
  const far = key.far || told.far === true
  const isNear = !far && settling.isNear(id)
  if (w.back?.reader === id) return refuse({ t: 'ahead', epoch: w.epoch, n: w.n })
  // A writer that lost its last writes stands back for the near reader that holds them, until a person says which goes on.
  if (settling.holds() && theirs === w.epoch && at > w.n && isNear && !w.wroteSince) {
    w.back = { reader: id, n: at }
    setHere(o.store, { back: w.back }, { toDisk: true })
    // What waited for the hold of the opening goes on, and is told that this writer stands back.
    settling.holdNoMore()
    o.raise('machine.ahead', { app: o.app, reader: id, n: at })
    settling.settle()
    for (const one of w.links.values()) tell(one.link, { t: 'machines', list: asks.machines() })
    return refuse({ t: 'ahead', epoch: w.epoch, n: w.n })
  }
  const kept = keptAt(o.store, at)
  const old = w.givenUp !== undefined && epochNumber(theirs) < w.givenUp
  const fits = !old && ((at === w.n && sum === placeOf(o).sum) || kept?.sum === sum)
  if (!fits) {
    const mayHoldMore =
      at > w.n || (kept !== undefined && kept.sum !== sum) || (isNear && settling.beatsHeld(id) === undefined)
    if (at > w.n) o.raise('machine.ahead', { app: o.app, reader: id, n: at })
    return refuse({ t: 'again', epoch: w.epoch, ...(mayHoldMore && !old ? { keep: true } : {}) })
  }
  // A second link that opens with a key closes the first one that was opened with it.
  for (const one of [...w.links.values()])
    if (one.key.id === key.id) {
      w.links.delete(one.id)
      one.link.close()
    }
  const joined: JoinedReader = {
    id,
    key,
    far,
    address,
    link,
    since: o.clock.now(),
    ready: new Set(),
    named: new Map(),
    waits: [],
    ...(text(told.own) ? { own: text(told.own) } : {}),
  }
  w.links.set(id, joined)
  // The machine that this one took over from has come back as its reader: it gave way, and this folder is a
  // writer like any other from now on, also where it is started again with the address it once read.
  const took = here(o.store).took
  if (took && !key.far && sameAddress(joined.own, took.from)) setHere(o.store, { took: undefined })
  settling.beatsOf(id, far).at = at
  tell(link, {
    t: 'go',
    epoch: w.epoch,
    n: w.n,
    settled: settling.settled(),
    mode: o.mode,
    beat: beatOf(w),
    behind: behindOf(w),
    // How the writer counts, which its readers count by.
    counting: countingTold(o),
  })
  asks.versions(joined)
  for (const change of keptChanges(o.store, at)) asks.send(link, change)
  // A reader is handed the rows that are kept in memory as they stand, which no record holds, and makes their tables.
  if (o.store.layout().some((one) => one.memory)) tell(link, { t: 'memory', rows: memoryHeld(o.store) })
  o.raise('reader.joined', { app: o.app, reader: id, far, n: at })
  const list = asks.machines()
  for (const one of w.links.values()) tell(one.link, { t: 'machines', list })
  settling.settle()
  return joined
}
