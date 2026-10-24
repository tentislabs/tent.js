import { here } from '../../data/index.ts'
import type { Admin } from '../admin.ts'

/**
 * `tent take-over`: makes this machine the writer. With `--look` it changes nothing, and answers what the machine
 * knows and what it may lack: its kind and its number, when its writer last answered it a beat, since when it
 * was not current, the number of every other reader it was told of, and how many files of tenants it is still
 * fetching. Without, it takes over, and answers the epoch and the number of its last write.
 */
export const admin: Admin = {
  name: 'take-over',
  async run(o, args) {
    if (Reflect.get(args, 'look') !== true) return o.machine.takeOver()
    const { reader } = o.machine
    const at = o.machine.at()
    const { id } = here(o.store)
    const since = reader?.since() ?? {}
    const others = o.machine
      .machines()
      .filter((one) => one.role === 'reader' && one.id !== id)
      .map((one) => ({ id: one.id, far: one.far, n: one.n, ...(one.own ? { own: one.own } : {}) }))
    // Only a reader of an app that keeps files of tenants fetches one: no other app loads what counts them.
    const fetching = o.tenantFiles && reader ? (await import('../files/following.ts')).fetchesLeft(o.tenantFiles) : 0
    return {
      role: o.machine.role(),
      far: reader?.reads.far ?? false,
      n: at.n,
      epoch: at.epoch,
      current: at.current,
      ...(since.beat === undefined ? {} : { lastBeat: since.beat }),
      ...(since.behind === undefined ? {} : { notCurrentSince: since.behind }),
      others,
      // A reader that holds more than this one holds writes that would be left behind.
      ahead: others.filter((one) => one.n > at.n).map((one) => one.id),
      // A file that has not arrived holds writes that were answered, and this machine lacks them.
      fetching,
    }
  },
}
