import { TentError } from '../core/index.ts'
import type { FileName, Tx } from '../data/index.ts'
import { rowIds } from '../data/index.ts'
import { calledId } from './calledId.ts'
import type { NewRun, RunState } from './face.ts'
import { flowOf } from './flowOf.ts'
import type { Held } from './held.ts'
import { asSaved } from './kept.ts'
import { fileKey, fileOf, idIn } from './places.ts'
import type { Source } from './rows.ts'
import { addRun, inWrite, readRun } from './rows.ts'
import { keyOfRun, mayJoin, underWay } from './keys.ts'
import { paceOf, pacedStart } from './pace.ts'
import { projectLimit } from './projectLimit.ts'
import { holdThread } from './threads.ts'
import { isFull, oldestBeside, togetherOf } from './together.ts'

/** A run that is added: as a start hands it, or as the runner adds it itself, with its key and the run it goes on from. */
export type Adding = NewRun & { key?: string; before?: string }

/**
 * The id of a run that is called or started while a step works: the one that the same call made before, where
 * a called run has not ended failed or stopped, and otherwise the next one. Answers the id, and whether its run is
 * there already.
 */
function idOfCall(source: Source, o: Adding, file: FileName | undefined): { id: string; there?: RunState } {
  const from = o.parent ?? o.from
  if (!from || o.call === undefined) return { id: idIn(rowIds.next(), file) }
  for (let endedBefore = 0; ; endedBefore += 1) {
    const id = idIn(calledId(from, o.call, endedBefore), file)
    const held = readRun(source, id)
    if (!held) return { id }
    // A called run that failed or was stopped is never answered a second time: the same call starts a new run. A
    // started run is nobody's child, and is found however it ended: the same start never starts a second one.
    if (!o.parent || (held.state !== 'failed' && held.state !== 'stopped')) return { id, there: held.state }
  }
}

/**
 * Adds a run, as part of the write it is handed or in a write of its own, and answers its id. A run that the same
 * call of the same step added before is answered and nothing is added. `stopped` is told each run that the start
 * of this one stops. A start that `pace.drop` drops answers the empty id. Throws T0001 for a flow that the version
 * does not hold, and T7103 for a start over the count of a flow that states `then: 'refuse'`.
 */
export function addRunOf(
  held: Held,
  o: Adding,
  tx: Tx | undefined,
  stop: (run: string) => void,
  // A run that a write of a table sets off is taken up as the work that wrote ends.
  soon = false,
): string {
  return addRunWith(held, o, tx, stop, soon).id
}

/** Adds a run as `addRunOf` does. Answers its id, with the state of the run where it was there already. */
export function addRunWith(
  held: Held,
  o: Adding,
  tx: Tx | undefined,
  stop: (run: string) => void,
  soon = false,
): { id: string; there?: RunState } {
  // A run lives in the file it is added in: the one that is named, and else the one of the run that called or started it.
  const from = o.parent ?? o.from
  const file = o.file ?? (from ? fileOf(from.run) : undefined)
  const source = tx ?? (file ? held.env.files?.of(file, { make: true }) : held.env.store)
  if (!source)
    throw new TentError('T0001', `No file of ${file?.table ?? 'a tenant'} ${file?.id ?? ''} is there for a run.`, {
      fix: 'Start the run for a tenant that is there.',
    })
  const flow = flowOf(held, o.version, o.flow)
  const { id, there } = idOfCall(source, o, file)
  if (there) return { id, there }
  const input = asSaved(o.input).value
  const event = asSaved(o.event).value
  const key = keyOfRun(held, o, flow, input, event)
  const counted = { flow: o.flow, input, file: fileKey(file), ...(key === undefined ? {} : { key }) }
  const together = togetherOf(flow)
  // A start of a key whose run is under way is answered that run, and starts nothing. A run that goes on from
  // another is no new start: it joins nothing, and is held to no pace.
  const goesOn = o.before !== undefined
  const joins = together?.then === 'join' && !goesOn ? underWay(source, counted) : undefined
  if (joins) {
    mayJoin(o.startedBy, joins)
    held.env.joined?.({ run: joins.id, flow: o.flow, ...(key === undefined ? {} : { key }) })
    return { id: joins.id, there: joins.state }
  }
  // A start of a paced flow may be dropped, gathered into the start of its key that waits, or wait itself, whoever
  // starts it: a step and a call too.
  const pace = goesOn ? undefined : paceOf(flow)
  const paced = pace
    ? pacedStart(source, { flow: o.flow, input, event, now: held.env.clock.now(), ...(key ? { key } : {}) }, pace)
    : undefined
  if (paced?.kind === 'dropped') {
    held.env.dropped?.({ flow: o.flow, ...(key === undefined ? {} : { key }) })
    return { id: '' }
  }
  if (paced?.kind === 'into') {
    held.later(paced.run, soon)
    return { id: paced.run, there: 'queued' }
  }
  const over =
    together !== undefined && together.then !== 'wait' && together.then !== 'join' && isFull(held, counted, flow)
  if (over && together.then === 'refuse')
    throw new TentError(
      'T7103',
      `As many runs of ${o.flow} work now as \`together.max\` of ${together.max} allows, and the flow refuses one more.`,
      { fix: 'Start it later, raise `together.max`, or leave `then` out so that a run waits its turn.' },
    )
  const parent = o.parent ? readRun(source, o.parent.run) : undefined
  // A run on a conversation settles who holds it inside the write that adds it.
  const holding = inWrite(source, (to) => {
    const holds =
      o.thread === undefined
        ? { now: true }
        : holdThread(
            to,
            { id, thread: o.thread, ...(o.then ? { then: o.then } : {}) },
            projectLimit(held, o.version, 'queued'),
          )
    addRun(to, {
      id,
      flow: o.flow,
      kind: flow.kind,
      version: o.version,
      state: 'queued',
      startedBy: o.startedBy,
      as: flow.as,
      top: parent?.top ?? id,
      used: [],
      workedMs: 0,
      createdAt: held.env.clock.now(),
      ...(input === undefined ? {} : { input }),
      ...(paced?.kind === 'new' && paced.event !== undefined
        ? { event: paced.event }
        : event === undefined
          ? {}
          : { event }),
      ...(paced?.kind === 'new' && paced.wakeAt !== undefined ? { wakeAt: paced.wakeAt } : {}),
      ...(o.parent ? { parent: o.parent.run } : {}),
      ...(o.parent?.step ? { parentStep: o.parent.step } : {}),
      ...(o.leave ? { leave: o.leave } : {}),
      ...(o.thread === undefined ? {} : { thread: o.thread }),
      ...(o.given ? { given: o.given } : {}),
      ...(key === undefined ? {} : { key }),
      ...(o.before === undefined ? {} : { from: o.before }),
      ...(o.trace ? { trace: o.trace } : {}),
    })
    return holds
  })
  if (holding.stop !== undefined) stop(holding.stop)
  // With `then: 'stop'` the oldest run that works makes room for this one.
  const oldest = over && together.then === 'stop' ? oldestBeside(held, counted, flow) : undefined
  if (oldest !== undefined) stop(oldest)
  if (holding.now) held.later(id, soon)
  return { id }
}
