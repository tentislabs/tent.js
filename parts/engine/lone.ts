import { TentError } from '../core/index.ts'
import { here } from '../data/index.ts'
import type { Machine } from './copy/machine.ts'
import { handed, notHanded, saysMore, withoutHanded } from './door/handed.ts'
import { epochOf, heldBy } from './held.ts'
import { noLink } from './noLink.ts'
import type { Opened } from './opened.ts'
import { recordTook } from './record.ts'

/**
 * Takes what holds the data of an app that runs on one machine: it was opened with no `own`, no `readers` and no
 * `reads`, or it is held for one piece of work alone, as by a query thread. Answers what such an app is among its
 * machines: a writer that joins nothing, waits for nothing, and hands nothing on. Nothing of the link between
 * machines is loaded for it.
 */
export function loneMachine(
  o: Pick<Opened, 'store' | 'tenantFiles'> & { clock?: Opened['clock']; handles?: Opened['handles'] },
  // Whether it lets its workers join over a connection that is not secure: it has no readers.
  insecure = false,
  // Makes a machine of the link take this one's place, where a request carries a key of a reader that the app holds.
  joining?: (request: Request) => Promise<void>,
): Machine {
  const since = o.clock?.now() ?? 0
  const never = (what: string): never => {
    throw new TentError('T0013', `This app runs on one machine: ${what}.`, {
      fix: 'Open the app with `own` and `readers`, or as a reader with `engine.read`.',
    })
  }
  return {
    keys: [],
    own: undefined,
    insecure,
    reached: () => never('it reaches no other'),
    role: () => 'writer',
    many: () => false,
    at() {
      const n = heldBy(o)
      return { n, settled: n, epoch: epochOf(o.store), sum: here(o.store).sum, current: true }
    },
    machines: () => [
      { id: here(o.store).id, role: 'writer', far: false, take: true, n: heldBy(o), current: true, since },
    ],
    writes: () => undefined,
    // An answer leaves once the place of record, where the app has one, took what it rests on.
    leaves: () => recordTook(o),
    becomeWriter: () => never('it is the writer, and takes nothing over'),
    taken(request, about) {
      if (!handed.some((name) => request.headers.has(name))) return { request, about }
      // No reader hands a request to an app on one machine: what only a reader may say has no key behind it.
      const { clean, sent } = withoutHanded(request)
      if (saysMore(sent)) throw notHanded()
      return { request: clean, about }
    },
    carries: () => false,
    keyed() {
      throw noLink()
    },
    ...(joining ? { joinable: joining } : {}),
    async answered(request, _about, _began, _taken, door) {
      const passed = await door.passes(request)
      const answer = passed instanceof Response ? passed : await door.answers(request, passed)
      await recordTook(o)
      return answer
    },
    async sent(_member, _args, _as, _reads, work) {
      const answer = await work()
      await recordTook(o)
      return answer
    },
    link() {
      throw noLink()
    },
    asked: () => undefined,
    noted: () => undefined,
    async takeOver() {
      throw new TentError('T0030', 'This machine is the writer already: nothing is taken over.', {
        fix: 'Run `tent take-over` on a reader, once its writer is stopped.',
      })
    },
    close: () => undefined,
  }
}
