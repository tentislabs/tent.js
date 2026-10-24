import type { StepOptions } from './face.ts'
import type { Queued } from './handOut.ts'
import { stepKey } from './handOut.ts'
import { usesOf } from './heldTo.ts'
import { msOf } from './lengths.ts'
import type { Pass, Reached } from './pass.ts'
import { beganAt, park, saveStep, tellStep } from './pass.ts'
import type { StepRow } from './rows.ts'

/** The kind of worker that a step's work goes to: the one it names, `any` for `background: true`, and nothing where it runs here. */
export function kindStated(o: StepOptions): string | undefined {
  if (typeof o.worker === 'string') return o.worker
  return o.background === true ? 'any' : undefined
}

/**
 * The work of a step that goes to a worker. A step whose try is out waits for its end. Otherwise it is noted as
 * begun and handed to the engine, which queues it, and nothing more is written: its run waits, and is woken by
 * the end of the try that a worker carries out.
 */
export function queueStep(
  pass: Pass,
  reached: Reached,
  kind: string,
  o: StepOptions,
  tries: { max: number; wait: number },
  given: StepRow | undefined,
): Promise<unknown> {
  const { at, branch } = reached
  const { held } = pass.of
  const { env } = held
  if (given?.state === 'started' && given.out) return park(pass, branch)
  const row =
    given?.state === 'started'
      ? given
      : saveStep(pass, at, {
          state: 'started',
          startedAt: given?.startedAt ?? beganAt(pass),
          wakeAt: null,
          tries: given?.tries ?? 0,
        })
  if (given?.state !== 'started') tellStep(pass, at, { state: 'started' })
  const run = pass.of.run
  const key = stepKey(run.id, at)
  const uses = usesOf(pass, o)
  if (!held.queued.has(key)) {
    const ms = o.time === undefined ? pass.of.limits.stepTime : msOf(o.time)
    const reserve = o.reserve === undefined ? ms : msOf(o.reserve)
    const queued: Queued = { run: run.id, step: at, kind: row.away?.worker ?? kind, ms, reserve, tries }
    held.queued.set(key, queued)
    env.queue?.({
      run: run.id,
      flow: run.flow,
      of: run.kind === 'action' ? 'action' : 'flow',
      step: at,
      version: run.version,
      kind: queued.kind,
      since: env.clock.now(),
      reserve,
      ...(row.away?.alone ? { alone: true as const } : {}),
      ...(o.rows ? { rows: o.rows } : {}),
      ...(uses ? { uses } : {}),
    })
  }
  return park(pass, branch)
}
