import { setHere } from '../../data/index.ts'
import { newer } from '../held.ts'
import type { ReaderKey } from './keys.ts'
import { tell } from './link.ts'
import type { WriterState } from './writerState.ts'
import { writerLine } from './writerState.ts'

/**
 * Takes what a writer holds of itself, and an epoch that a machine named and that is newer than its own, with
 * the address of that machine where it told one. The writer goes on: it keeps the newest such writer in memory,
 * writes it into its log, and tells whoever listens.
 */
export function writerHeardOf(w: WriterState, theirs: string, theirOwn?: string): void {
  const { o } = w
  if (!w.other || newer(theirs, w.other.epoch)) w.other = { epoch: theirs, ...(theirOwn ? { own: theirOwn } : {}) }
  writerLine(w, 'warn', 'Another writer was heard of, under a newer epoch. This writer goes on.', { epoch: theirs })
  o.raise('writer.other', { app: o.app, epoch: theirs })
}

/**
 * Takes what a writer holds of itself, and what a machine that took over under a newer epoch told. The writer
 * gives way: it stops for good, and says so on every link.
 */
export function gaveWay(w: WriterState, told: { epoch: string; own?: string }): void {
  const { o } = w
  // The role has reached the disk before the machine that took over is answered: this writer stops for good.
  w.stopped = { epoch: told.epoch, ...(told.own ? { own: told.own } : {}) }
  setHere(o.store, { role: 'stopped', stopped: w.stopped, back: undefined }, { toDisk: true })
  w.back = undefined
  // The runs are the new writer's from here on: this machine wakes none and carries none out.
  void o.flows?.runner.close()
  writerLine(w, 'warn', 'A machine took over. This writer is stopped for good.', w.stopped)
  for (const one of [...w.links.values()]) {
    tell(one.link, { t: 'no', code: 'T0030', ...(told.own ? { writer: told.own } : {}) })
    one.link.close()
  }
  o.raise('writer.changed', { app: o.app, epoch: told.epoch })
}

/**
 * Takes what a writer holds of itself, what a machine that took over told, and the key it told it with. Answers
 * nothing where this writer gives way, and the other epoch otherwise: its own where it goes on, and of a writer
 * that was stopped the newest epoch it was told before, of which it keeps the newer. A far key is believed nothing.
 */
export function tookTold(
  w: WriterState,
  told: { epoch: string; own?: string },
  key: ReaderKey,
): { other: string; own?: string } | undefined {
  const { o, own } = w
  if (key.far) {
    writerHeardOf(w, told.epoch, told.own)
    return { other: w.epoch, ...(own ? { own } : {}) }
  }
  if (w.stopped) {
    const first = w.stopped
    if (newer(told.epoch, first.epoch)) {
      w.stopped = { epoch: told.epoch, ...(told.own ? { own: told.own } : {}) }
      setHere(o.store, { stopped: w.stopped }, { toDisk: true })
    }
    return { other: first.epoch, ...(first.own ? { own: first.own } : {}) }
  }
  if (!newer(told.epoch, w.epoch)) return { other: w.epoch, ...(own ? { own } : {}) }
  gaveWay(w, told)
  return undefined
}
