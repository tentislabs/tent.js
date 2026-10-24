import type { Told } from '../../flows/index.ts'
import { TentError } from '../../core/index.ts'
import { toldPart } from '../ai/told.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'

/** What one pass of one step said: its last value, the one that waits to be sent, and when one was sent last. */
interface Saying {
  step: string
  repeat: number
  value: unknown
  waits?: { value: unknown }
  timer?: NodeJS.Timeout
  sentAt: number
}

// What each run of an app says now, by the handles of the app, the run, and the pass of the step.
const sayings = new WeakMap<object, Map<string, Map<string, Saying>>>()

const sayingsIn = (o: Opened, run: string): Map<string, Saying> => {
  const app = sayings.get(o.handles) ?? new Map<string, Map<string, Saying>>()
  sayings.set(o.handles, app)
  const held = app.get(run) ?? new Map<string, Saying>()
  app.set(run, held)
  return held
}

const keyOf = (step: string, repeat: number): string => `${repeat}\n${step}`

/** Sends what one pass of a step said to whoever follows its run. */
function sent(o: Opened, run: string, one: Saying, value: unknown): void {
  one.sentAt = performance.now()
  toldPart(o, run, { kind: 'said', step: one.step, repeat: one.repeat, value })
}

/**
 * Takes an app, where the work of a step stands, and a value that it says. The value is held to `limits.inFrame`,
 * whose words T5102 names, and goes to whoever follows the run, `limits.saidPerSecond` times a second at most for
 * one pass of one step: a value said sooner waits, and the newest takes the place of one that waits. It is kept as
 * the last value of that pass while the step works, for a watcher that comes late, and is never saved.
 */
export function said(o: Opened, at: { run: string; step?: { name: string; repeat: number } }, value: unknown): void {
  const most = storedLimit(o.description, 'inFrame')
  const size = Buffer.byteLength(JSON.stringify(value) ?? 'null')
  if (size > most)
    throw new TentError('T5102', `What the step said holds ${size} bytes, past \`limits.inFrame\` of ${most}.`, {
      fix: 'Say less at a time, within `limits.inFrame`: what a step says is a value to show, and its result is what is kept.',
    })
  const step = at.step
  if (!step) return
  const held = sayingsIn(o, at.run)
  const key = keyOf(step.name, step.repeat)
  const one = held.get(key) ?? { step: step.name, repeat: step.repeat, value, sentAt: Number.NEGATIVE_INFINITY }
  held.set(key, one)
  one.value = value
  const every = 1000 / Math.max(1, storedLimit(o.description, 'saidPerSecond'))
  const wait = one.sentAt + every - performance.now()
  if (wait <= 0 && !one.timer) {
    sent(o, at.run, one, value)
    return
  }
  one.waits = { value }
  one.timer ??= setTimeout(
    () => {
      one.timer = undefined
      const waits = one.waits
      one.waits = undefined
      if (waits) sent(o, at.run, one, waits.value)
    },
    Math.max(0, wait),
  )
}

/** A step ended: what it said and still waits is sent now, before the part that ends it, and it is kept no more. */
function stepEnded(o: Opened, run: string, step: string, repeat: number): void {
  const held = sayings.get(o.handles)?.get(run)
  const one = held?.get(keyOf(step, repeat))
  if (!held || !one) return
  if (one.timer) clearTimeout(one.timer)
  if (one.waits) sent(o, run, one, one.waits.value)
  held.delete(keyOf(step, repeat))
}

/** A step began again: what it said before is dropped, as the page drops it on `again`. */
function stepAgain(o: Opened, run: string, step: string, repeat: number): void {
  const held = sayings.get(o.handles)?.get(run)
  const one = held?.get(keyOf(step, repeat))
  if (one?.timer) clearTimeout(one.timer)
  held?.delete(keyOf(step, repeat))
}

/** A run ended: nothing of what it said is kept. */
function runEnded(o: Opened, run: string): void {
  const held = sayings.get(o.handles)?.get(run)
  for (const one of held?.values() ?? []) if (one.timer) clearTimeout(one.timer)
  sayings.get(o.handles)?.delete(run)
}

/**
 * Is told what the runner tells of a run: what a step said that still waits is sent before the part that ends the
 * step, a step that begins again said nothing yet, and a run that ended keeps nothing of what it said.
 */
export function saidTold(o: Opened, what: Told): void {
  if (what.kind === 'step' && what.state === 'started') stepAgain(o, what.run, what.name, what.repeat)
  if (what.kind === 'step' && (what.state === 'done' || what.state === 'failed'))
    stepEnded(o, what.run, what.name, what.repeat)
  if (what.kind === 'run' && ['done', 'failed', 'stopped'].includes(what.state)) runEnded(o, what.run)
}

/** What every run of an app said last, of each step at work: a reader that joins is told it. */
export const sayingsOf = (o: Opened): { run: string; step: string; repeat: number; value: unknown }[] =>
  [...(sayings.get(o.handles)?.entries() ?? [])].flatMap(([run, held]) =>
    [...held.values()].map((one) => ({ run, step: one.step, repeat: one.repeat, value: one.value })),
  )

/** The last value that each step of a run said that is still at work, for a watcher that comes late. */
export const saidOf = (o: Opened, run: string): { step: string; repeat: number; value: unknown }[] =>
  [...(sayings.get(o.handles)?.get(run)?.values() ?? [])].map((one) => ({
    step: one.step,
    repeat: one.repeat,
    value: one.value,
  }))
