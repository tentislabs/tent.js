import type { Caller } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'
import { answerAsk } from '../flows/askWaits.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { whoOf } from './streams.ts'

/** A call that asks a person, as the engine keeps it under the door's text of its T7120 for the page of `/_t/ask`. */
export interface Waiting {
  name: string
  input: unknown
  who: string
  user: string
  // Answered on the page: a yes or a no, which the page then shows.
  said?: 'allow' | 'refuse'
  // The ask of a run that the call waited for, which the page answers in the run itself.
  run?: { id: string; step: string; repeat: number }
  // Of the ask of a sequence: every call that it lists, and whether more may follow, which the page shows.
  sequence?: Record<string, unknown>[]
  more?: boolean
}

/** The calls that the T7120 of the ask of a sequence lists, and whether more may follow, where it lists any. */
export function listedOf(fields: Record<string, string> | undefined): Pick<Waiting, 'sequence' | 'more'> {
  let listed: unknown
  try {
    listed = JSON.parse(fields?.sequence ?? 'null')
  } catch {
    return {}
  }
  if (!Array.isArray(listed)) return {}
  return { sequence: listed.filter((one) => isStored(one)), more: fields?.more === 'true' }
}

/** What one app keeps of the asking of people, in memory alone: a restart ends it, as it ends the texts. */
interface Held {
  // The calls that wait for a person, by the door's text, each with the moment it goes.
  waiting: Map<string, { one: Waiting; until: number }>
  // The yes of a person on the page, by the call it is for: the door's text that the next such call runs with.
  agreed: Map<string, { text: string; until: number }>
  // What a call that came with a yes answered, by the text of the yes, for a yes that arrives twice.
  answered: Map<string, { call: string; value: Promise<unknown>; until: number }>
}

const held = new WeakMap<Opened, Held>()

function heldOf(o: Opened): Held {
  const made = held.get(o) ?? { waiting: new Map(), agreed: new Map(), answered: new Map() }
  held.set(o, made)
  const now = o.clock.now()
  for (const all of [made.waiting, made.agreed, made.answered])
    for (const [key, one] of all) if (one.until <= now) all.delete(key)
  return made
}

/** Whether an ask of `/_t/ask` waits for its answer, or a yes or a used text of one is kept: the app is in use. */
export function askingKept(o: Opened): boolean {
  if (!held.has(o)) return false
  const { waiting, agreed, answered } = heldOf(o)
  return waiting.size + agreed.size + answered.size > 0
}

/** A value as one text, with the fields of every record in the order of their names. */
function steady(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(steady).join(',')}]`
  if (isStored(value))
    return `{${Object.keys(value)
      .sort()
      .map((name) => `${JSON.stringify(name)}:${steady(value[name])}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

/** One call, by its function, its input and its caller. */
export const askedCallOf = (name: string, input: unknown, caller: Caller): string =>
  `${name}\n${steady(input)}\n${whoOf(caller)}`

const lifeOf = (o: Opened): number => storedLimit(o.description, 'askTime')

/** Keeps a call that asks a person, for the page of `/_t/ask`, for `askTime` and within `callSize`. */
export function keepWaiting(o: Opened, text: string, one: Waiting): boolean {
  if (steady(one.input).length > storedLimit(o.description, 'callSize')) return false
  heldOf(o).waiting.set(text, { one, until: o.clock.now() + lifeOf(o) })
  return true
}

/** The call that waits under the door's text, where one does. */
export const waitingAt = (o: Opened, text: string): Waiting | undefined => heldOf(o).waiting.get(text)?.one

/** Notes the person's answer on the page: a yes lets the next such call of the caller run, once. */
export function answeredOnPage(o: Opened, text: string, said: 'allow' | 'refuse'): void {
  const kept = heldOf(o).waiting.get(text)
  if (!kept) return
  kept.one.said = said
  const { run } = kept.one
  // The ask of a run is answered in the run, which the call that comes back with `{ run }` waits for.
  if (run) answerAsk(o, { run: run.id, step: run.step, repeat: run.repeat }, said === 'refuse')
  else if (said === 'allow')
    heldOf(o).agreed.set(`${kept.one.name}\n${steady(kept.one.input)}\n${kept.one.who}`, {
      text,
      until: o.clock.now() + lifeOf(o),
    })
}

/** The door's text that a yes on the page gave this call, once: it is spent by asking. */
export function agreedOnPage(o: Opened, call: string): string | undefined {
  const all = heldOf(o).agreed
  const found = all.get(call)
  all.delete(call)
  return found?.text
}

/**
 * Carries out a call that came with a yes, once for each text: the same yes that arrives again, for the same call,
 * is answered what the first was, for `askTime`.
 */
export function onceFor(o: Opened, text: string, call: string, work: () => Promise<unknown>): Promise<unknown> {
  const all = heldOf(o).answered
  const kept = all.get(text)
  if (kept && kept.call === call) return kept.value
  const value = work()
  all.set(text, { call, value, until: o.clock.now() + lifeOf(o) })
  // A yes whose call failed is not kept: the failure is answered once.
  value.catch(() => all.delete(text))
  return value
}
