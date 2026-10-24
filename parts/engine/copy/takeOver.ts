import { TentError } from '../../core/index.ts'
import { beginEpoch, here, keepChanges, setHere } from '../../data/index.ts'
import { archiveOf, keepsArchive, makeArchive } from '../archived/archive.ts'
import { flowsOf } from '../flows/needs.ts'
import { heldBy, manyLimit, newer, sameAddress } from '../held.ts'
import type { Opened } from '../opened.ts'
import { writesNow } from '../record.ts'
import { keepUp } from '../upkeep.ts'
import { notReached } from './reach.ts'
import { afterLoss } from './restored.ts'

/**
 * Tells the writer that a machine followed that the machine took over, with its own key, every beat until it is
 * answered, and notes that it was. A writer of a newer epoch that answers makes this machine give way; one that
 * names an older epoch of another machine has that machine told as well.
 */
function tellTook(o: Opened, to: string, key: string, epoch: string): void {
  const told = new Set<string>()
  const send = (address: string): void => {
    if (o.closed || !o.machine.writer || o.machine.writer.state() === 'stopped') return
    const again = (): void =>
      void o.clock.setTimer(o.clock.now() + manyLimit(o.description, 'beat'), () => send(address))
    const body = JSON.stringify({ epoch, ...(o.machine.own ? { own: o.machine.own } : {}) })
    const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' }
    let asking: Promise<Response>
    try {
      asking = o.machine
        .reached(address)
        .request(new Request(`${address}/_t/copy/took`, { method: 'POST', headers, body }))
    } catch {
      again()
      return
    }
    asking
      .then(async (answer) => {
        const read: unknown = await answer.json().catch(() => undefined)
        const value: unknown = Reflect.get(Object(read), 'value')
        // A machine that is no writer answers T0030, and is asked no more. Any other failure is asked again.
        if (!answer.ok)
          return Reflect.get(Object(Reflect.get(Object(read), 'error')), 'code') === 'T0030' ? undefined : again()
        if (address === to && !o.closed) setHere(o.store, { took: { from: to, answered: true } })
        const [other, own]: unknown[] = [Reflect.get(Object(value), 'other'), Reflect.get(Object(value), 'own')]
        if (typeof other !== 'string') return
        if (newer(other, epoch)) {
          // Another machine took over under a newer epoch: this one gives way to it.
          o.machine.writer?.giveWay({ epoch: other, ...(typeof own === 'string' ? { own } : {}) })
          return
        }
        if (typeof own === 'string' && !told.has(own) && !sameAddress(own, o.machine.own)) {
          told.add(own)
          send(own)
        }
      })
      .catch(again)
  }
  send(to)
}

/**
 * Takes what the engine holds of an app. Makes this machine the writer of what it holds: a reader stops following,
 * begins a new epoch in one write, which is its first change, goes on as a writer does when it opens, lets
 * readers join, and tells the writer it followed. A writer that stands back for a reader goes on with what it
 * holds, under a new epoch. Answers the epoch and the number of its last write. Throws T0030 on a machine that is
 * the writer, T0029 on a reader that does not hold the whole data, and T0032 on a reader that is current.
 */
export function takeOver(o: Opened): Promise<{ epoch: string; n: number }> {
  // One taking over at a time: while one is under way, between the closing of the reader and its first write as
  // the writer, the machine is neither, and whoever asks then is answered as the first is.
  const underWay = taking.get(o)
  if (underWay) return underWay
  const mine = taken(o).finally(() => taking.delete(o))
  taking.set(o, mine)
  return mine
}

// The taking over that is under way on each app.
const taking = new WeakMap<Opened, Promise<{ epoch: string; n: number }>>()

async function taken(o: Opened): Promise<{ epoch: string; n: number }> {
  const { reader, writer } = o.machine
  const mine = here(o.store)
  if (writer) {
    if (writer.state() !== 'back')
      throw new TentError('T0030', 'This machine is the writer already: nothing is taken over.', {
        fix: 'Run `tent take-over` on a reader, once its writer is stopped.',
      })
    // A writer that lost writes of its shared file goes on as after a file was put back: no place of a reader fits.
    const epoch = writer.lost()
      ? afterLoss(o)
      : o.store.write((tx) => {
          setHere(tx, { back: undefined, near: undefined })
          return beginEpoch(tx, mine.id)
        }).value
    writer.goOn()
    o.raise('writer.changed', { app: o.app, epoch })
    return { epoch, n: heldBy(o) }
  }
  if (!reader) throw new TentError('T0009', 'The app is neither a writer nor a reader.')
  if (!reader.whole())
    throw notReached(reader.writer(), 'this reader does not hold the whole data yet, and takes nothing over')
  if (reader.current()) {
    const from = new Date(o.clock.now() + manyLimit(o.description, 'behind')).toISOString()
    throw new TentError('T0032', 'This reader is current: its writer runs, and two writers must never both write.', {
      fix: `Stop the writer first. Taking over passes ${manyLimit(o.description, 'behind')} ms after its last beat was answered, no sooner than ${from}.`,
    })
  }
  const { from, key } = reader.reads
  // The near readers that this machine was last told of may hold what it was answered: it waits for them as a writer that opens again does.
  const near = reader
    .rows()
    .filter((one) => one.role === 'reader' && !one.far && one.current && one.id !== mine.id)
    .map((one) => one.id)
  reader.close()
  // Each kept change that a file does not hold yet is applied first.
  await o.tenantFiles?.idle()
  // The store is opened again: it reads the largest id of each table anew, so that the ids of this machine start
  // above every id it applied whatever its clock says, and the count of writes is taken from what it applied.
  o.tenantFiles?.closeFiles()
  o.store.close()
  // The sink is the writer's: opened again as the writer, the store starts it.
  writesNow(o)
  o.store.open(o.dataFolder)
  keepChanges(o.files ?? o.store)
  // The archive is the writer's: from the write that begins the epoch on, this machine keeps it.
  if (!archiveOf(o) && keepsArchive(o.description)) {
    const archive = makeArchive(o)
    o.made.push(archive)
    archive.started()
  }
  const epoch = o.store.write((tx) => {
    setHere(tx, {
      role: 'writer',
      took: { from, answered: sameAddress(from, o.machine.own) },
      from: undefined,
      far: undefined,
      take: undefined,
      near: near.length ? near : undefined,
      ...(o.machine.own ? { own: o.machine.own } : {}),
    })
    return beginEpoch(tx, mine.id)
  }).value
  o.machine.becomeWriter()
  // The upkeep of a reader gives way to the writer's whole upkeep.
  o.upkeep?.close()
  o.upkeep = keepUp(o, false)
  // The columns that work fills are made by the writer, which this machine is now.
  if (!o.filling) {
    o.filling = (await import('../fill/pass.ts')).keepFilling(o)
    o.made.push(o.filling)
  }
  // The runs go on here: each one that is due is taken up, and each timer of the app is this machine's now.
  await flowsOf(o)
  o.raise('writer.changed', { app: o.app, epoch })
  o.log.write('lines', {
    at: o.clock.now(),
    level: 'warn',
    message: 'This machine took over, and is the writer. Start it without `--reads` from now on.',
    data: JSON.stringify({ epoch, from }),
  })
  // It sends none where that address leads to itself.
  if (!sameAddress(from, o.machine.own)) tellTook(o, from, key, epoch)
  return { epoch, n: heldBy(o) }
}
