import type { Used } from '../../ai/index.ts'
import { TentError } from '../../core/index.ts'
import { rowIds } from '../../data/index.ts'
import type { CallContext } from '../context.ts'
import { mayPlace } from '../flows/workPlace.ts'
import type { Remote } from '../work/remote.ts'

// The last `may` of each model, for the work of each task, with its key and its nth, which its `did` names again.
const mays = new WeakMap<Remote, Map<string, { may: string; key: string; nth: number }>>()

/**
 * Takes the call context of work on a worker, and a model call that the work makes itself. Sends the `may` before
 * it, with its once-only key and its place, which the writer holds to the limits of the model and of the run: the
 * call starts once it is answered, and fails with what the writer refused it with.
 */
export async function mayOnWorker(cx: CallContext, asked: { model: string; call: string }): Promise<void> {
  const remote = cx.remote
  if (!remote) throw new TentError('T0009', 'A call of a worker is made in the work of a task.')
  const { key, nth } = mayPlace(cx, asked.model, asked.call)
  const may = rowIds.next()
  const held = mays.get(remote) ?? new Map<string, { may: string; key: string; nth: number }>()
  mays.set(remote, held.set(asked.model, { may, key, nth }))
  await remote.ask({ what: 'may', may, model: asked.model, call: asked.call, key, nth })
}

/** Sends the `did` of one try of a model call that the work on a worker made: the writer counts what it used. */
export function didOnWorker(remote: Remote, used: Used): void {
  const { may, key, nth } = mays.get(remote)?.get(used.name) ?? { may: '', key: '', nth: 0 }
  void remote
    .ask({
      what: 'did',
      may,
      model: used.name,
      answeredBy: used.answeredBy,
      call: used.kind,
      key,
      nth,
      ok: used.ok,
      units: used.units ?? {},
      ms: Math.round(used.ms),
      ...(used.code ? { code: used.code } : {}),
    })
    .catch(() => undefined)
}
