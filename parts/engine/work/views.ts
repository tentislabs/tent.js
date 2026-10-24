import type { Opened } from '../opened.ts'
import type { Holding } from './holding.ts'
import type { InQueue, Joined } from './state.ts'

/** `app.workers`: each worker that is joined, with its kinds, what it works on, what it holds, and since when it is joined. */
export const workersOf = (all: Map<string, Joined>): object[] =>
  [...all.values()]
    .filter((j) => j.joined)
    .map((j) => ({
      id: j.id,
      kinds: j.kinds,
      atOnce: j.atOnce,
      working: [...j.out.values()].map((one) => ({
        task: one.task,
        run: one.steps[0]?.run,
        step: one.steps[0]?.step.name,
        repeat: one.steps[0]?.step.repeat,
        since: one.at,
      })),
      ready: [...j.ready],
      loaded: j.loaded,
      ...(j.going === undefined ? {} : { going: j.going }),
      ...(j.released ? { released: true } : {}),
      inARow: j.inARow,
      key: j.key.id,
      since: j.since,
    }))

/** `app.work`: for each kind what waits, the age of the oldest, how many a limit holds back, what is out, its limits of use, and its workers. */
export function workOf(
  o: Opened,
  queued: Iterable<InQueue>,
  all: Map<string, Joined>,
  holding: Pick<Holding, 'heldBack' | 'shown'>,
): object[] {
  const now = o.clock.now()
  const waiting = [...queued]
  const kinds = new Set([...Object.keys(Object(o.description.project.workers)), ...waiting.map((one) => one.w.kind)])
  return [...kinds].sort().map((kind) => {
    const of = waiting.filter((one) => one.w.kind === kind)
    let out = 0
    for (const j of all.values()) for (const one of j.out.values()) if (one.kind === kind) out++
    return {
      kind,
      waiting: of.length,
      ...(of.length ? { oldest: now - Math.min(...of.map((one) => one.w.since)) } : {}),
      heldBack: holding.heldBack(kind),
      out,
      limits: holding.shown(kind),
      workers: [...all.values()].filter((j) => j.joined && j.kinds.includes(kind)).map((j) => j.id),
    }
  })
}
