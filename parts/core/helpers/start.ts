import type { Marker } from '../definition.ts'
import { runtime } from '../runtime.ts'

/**
 * Takes a flow or an agent, and its input. Starts a run through the runtime and does not wait for it. Answers
 * what the runtime answers, which holds the id of the run, or `dropped` for a start that `pace.drop` of its flow
 * dropped. Throws T0010 where the slot is empty.
 */
export function start(
  flow: Marker,
  input?: unknown,
): { run: string; dropped?: undefined } | { run?: undefined; dropped: true }
export function start(flow: Marker, input?: unknown): unknown {
  return runtime('start').start(flow.definition, input)
}
