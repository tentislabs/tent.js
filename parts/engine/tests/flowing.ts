import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { App, OpenOptions } from '../index.ts'
import type { Bundling, Running } from './apps.ts'
import { running, system, testClock } from './apps.ts'
import { notDropped } from './started.ts'

/** An app of the project of the flows, on a clock that the test moves. */
export interface Flowing extends Running {
  advance(ms: number): void
  now(): number
}

/** Builds the project of the flows and opens it, in the mode `test`, on a clock that stands still until the test moves it. */
export async function flowing(
  t: TestContext,
  o: Bundling & { open?: Partial<OpenOptions>; clock?: ReturnType<typeof testClock> } = {},
): Promise<Flowing> {
  const { clock, advance } = o.clock ?? testClock()
  const { clock: _, ...bundling } = o
  const run = await running(t, { project: 'flowing', ...bundling, engine: { makers: { clock: () => clock } } })
  return { ...run, advance, now: () => clock.now() }
}

/** Lets the work that is queued in the runtime go on, a few rounds of it. */
export async function settle(rounds = 30): Promise<void> {
  for (let round = 0; round < rounds; round += 1) await new Promise<void>((resolve) => setImmediate(resolve))
}

/** Waits until something holds, and fails where it does not come to hold. */
export async function untilWithin(
  holds: () => boolean | Promise<boolean>,
  what: string,
  within = 20_000,
): Promise<void> {
  const ends = performance.now() + within
  while (performance.now() < ends) {
    if (await holds()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 2))
  }
  assert.fail(`it did not come to hold: ${what}`)
}

/** Waits until a run stands in a state. */
export const untilState = (app: App, run: string, state: string): Promise<void> =>
  untilWithin(
    () => app.runs.read(run)?.state === state,
    `the run ${run} stands at ${state}, and not at ${app.runs.read(run)?.state}`,
  )

/** The marks that the work of the steps left, in the order in which they were written. */
export async function marksOf(app: App): Promise<string[]> {
  const rows = await app.call('allMarks', {}, { as: system })
  return (Array.isArray(rows) ? rows : []).map((row) => String(Object(row).what))
}

/** Starts a run of a flow as the system, or as the caller that is named. */
export async function started(app: App, flow: string, input?: unknown, as: Caller = system): Promise<string> {
  return notDropped(await app.start(flow, input, { as })).run
}
