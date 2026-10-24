import { TentError } from '../../core/index.ts'
import type { Listed, SequenceDoors } from '../../core/internal.ts'
import { checkValue, twoLinesOf, walkSequence, written } from '../../core/internal.ts'
import { modelCall } from '../layer/modelCall.ts'
import { reasoningFor } from './reasoning.ts'
import type { Running } from './running.ts'
import { reached } from './running.ts'
import type { Made } from './sequenceDone.ts'
import { ending, toldError } from './sequenceDone.ts'
import { leaveOf, madeCall } from './toolCall.ts'
import { askTimeOf } from './agentOf.ts'

/** What one sequence holds while it is carried out: where it stands, and what it did and was agreed to. */
export interface Sequencing {
  r: Running
  n: number
  m: number
  body: object[]
  // The answers of the calls and the fills it reached, by the names of their steps, which the walk reads.
  saved: Record<string, unknown>
  made: Made[]
  // The listed calls of the approved asks of this sequence.
  agreed: { step: string; input: unknown }[]
  line: number
  // When a door last answered: the work between two doors is held to `limits.pass`.
  since: number
  // The places of the `all`s one of whose entries failed: their other entries stop at their next call.
  stopped: string[]
}

const sameInput = (a: unknown, b: unknown): boolean => written(a, undefined) === written(b, undefined)

/** The places of a step of this sequence, from its name: `tool N.P.K.E.J name` gives K, E and J. */
function placeOf(step: string): number[] {
  const numbers = step.split(' ')[1] ?? ''
  return numbers.split('.').slice(2).map(Number)
}

/** Ends the work between two doors where it passed `limits.pass`. */
export function passed(s: Sequencing): void {
  if (performance.now() - s.since > s.r.agent.limits.pass)
    throw ending(
      new TentError('T5104', 'The sequence worked past `limits.pass` of the agent between two of its calls.', {
        fix: 'Hand less work to one sequence, or raise `limits.pass` of the agent.',
      }),
    )
}

/** The list of a walk held to the size of a tool's answer: past it the list is cut, and `more` is true. */
function cutTo(calls: Listed[], more: boolean, most: number): { sequence: Listed[]; more: boolean } {
  const sequence = [...calls]
  let cut = more
  while (sequence.length && JSON.stringify(sequence).length > most) {
    sequence.pop()
    cut = true
  }
  return { sequence, more: cut }
}

/** Walks the sequence as it stands, within the entry of an `all` where one is given. */
function walked(s: Sequencing, within?: number[]): { calls: Listed[]; more: boolean } {
  const { r } = s
  return walkSequence(r.told.description, r.agent.name, s.body, s.saved, {
    at: [s.n, s.m],
    called: r.told.called,
    specs: [...r.told.specs, ...r.told.outside],
    agreed: s.agreed,
    ...(within ? { within } : {}),
    tick: () => passed(s),
  })
}

/**
 * Asks the starter once for what the walk lists, in the step `ask N.P.K` of the waiting call or `all`. A walk that
 * lists more calls than are left of `toolCalls` ends the sequence with T7102 before any of them: the waiting call
 * was counted already where `counted` says so, and an `all` counts none. A no, or the end of `limits.ask`, ends it
 * with T7111. A yes covers each listed call that asks, by the name of its step and its input. Answers what was shown.
 */
async function asked(
  s: Sequencing,
  at: number[],
  first: { tool: string; input: unknown },
  walk: { calls: Listed[]; more: boolean },
  counted: boolean,
): Promise<unknown> {
  const { r } = s
  const limit = r.agent.limits.toolCalls
  const left = limit - r.toolCalls.n + (counted ? 1 : 0)
  if (walk.calls.length > left)
    throw ending(
      new TentError(
        'T7102',
        `The sequence would make ${walk.calls.length} more calls, and ${left} are left of \`limits.toolCalls\` (${limit}).`,
        { fields: { limit: 'toolCalls', unit: 'calls' } },
      ),
    )
  const shown = { tool: first.tool, input: first.input, ...cutTo(walk.calls, walk.more, r.agent.limits.result) }
  const answer = await r.step.waitFor(`ask ${s.n}.${s.m}.${at.join('.')}`, {
    timeout: askTimeOf(r.agent),
    show: shown,
  })
  s.since = performance.now()
  if (answer.approved !== true) throw ending(new TentError('T7111', 'The person refused this.'))
  const saved: unknown = Reflect.get(Object(answer.shown ?? shown), 'sequence')
  for (const one of Array.isArray(saved) ? saved : [])
    if (Reflect.get(Object(one), 'asks') === true)
      s.agreed.push({ step: String(Reflect.get(Object(one), 'step')), input: Reflect.get(Object(one), 'input') })
  return answer.shown ?? shown
}

/** Whether an approved ask of this sequence covers a call: the name of its step, with the same input. */
const covered = (s: Sequencing, step: string, input: unknown): boolean =>
  s.agreed.some((one) => one.step === step && sameInput(one.input, input))

/** A call of a tool of a sequence: checked, counted, asked about where no yes covers it, and made in its step. */
async function toolDoor(s: Sequencing, name: string, input: unknown, at: number[]): Promise<unknown> {
  const { r } = s
  const place = at.join('.')
  if (s.stopped.some((one) => place.startsWith(`${one}.`)))
    throw new TentError('T0013', 'The entry stopped: another entry of its `all` failed.')
  r.toolCalls.n += 1
  if (r.toolCalls.n > r.agent.limits.toolCalls) throw ending(reached('toolCalls', 'calls', r.agent.limits.toolCalls))
  const step = `tool ${s.n}.${s.m}.${place} ${name}`
  const tool = r.offered.find((one) => one.entry.told === name)
  if (!tool) throw new TentError('T0001', `no such tool: ${name}`)
  // The input of a tool of an outside server is held by the server, by the schema its approval wrote.
  const misses = tool.kind === 'outside' ? [] : checkValue(tool.input, input)
  if (misses.length) {
    const lines = twoLinesOf(r.told.description, r.agent.name, name, {
      called: r.told.called,
      specs: [...r.told.specs, ...r.told.outside],
    })
    throw new TentError('T0002', [...misses.map((one) => one.message), lines].filter(Boolean).join('\n'))
  }
  let leave = leaveOf(tool)
  if (tool.asks) {
    // A yes is for the input that was shown: where the call would be made with another, it is asked about anew, in
    // the next pass of its ask step. An ask inside an entry of an `all` walks to the end of that entry and no further.
    while (!covered(s, step, input)) {
      const within = at.length > 1 ? at.slice(0, -1) : undefined
      const shown = await asked(s, at, { tool: name, input }, walked(s, within), true)
      const listed: unknown = Reflect.get(Object(shown), 'sequence')
      const holds = Array.isArray(listed) && listed.some((one) => Reflect.get(Object(one), 'step') === step)
      if (!holds && sameInput(Reflect.get(Object(shown), 'input'), input)) s.agreed.push({ step, input })
    }
    leave = 'agreed'
  }
  try {
    const answer = await madeCall(r, step, tool, input, { leave, show: { tool: name, input } })
    s.saved[step] = answer
    s.made.push({ at, tool: name, input, answer })
    return answer
  } catch (error) {
    throw toldError(error, r.agent.words)
  } finally {
    s.since = performance.now()
  }
}

/** A `fill` of a sequence: one call of the agent's model with the shape and the prompt alone, in its step. */
async function fillDoor(s: Sequencing, shape: object, prompt: string, at: number[]): Promise<unknown> {
  const { r } = s
  r.fills.n += 1
  if (s.n + r.fills.n > r.agent.limits.steps) throw ending(reached('steps', 'steps', r.agent.limits.steps))
  const step = `fill ${s.n}.${s.m}.${at.join('.')}`
  try {
    // Its reasoning is told to whoever follows the run as those of a model step are.
    const { reasoning } = reasoningFor(r, step)
    const value = await r.step(step, () =>
      modelCall(r.env, {
        model: r.agent.model,
        method: 'fill',
        args: [shape, prompt, { reasoning }],
        caller: r.starter,
        version: r.run.version,
        at: { run: r.run.id, step, repeat: 1 },
        signal: r.run.signal,
      }),
    )
    s.saved[step] = value
    return value
  } finally {
    s.since = performance.now()
  }
}

/**
 * An `all` of a sequence: before any entry starts, the whole `all` is walked, and where it lists a call that asks
 * the sequence waits once, as the ask of the `all`. The entries then run side by side, each under
 * `toolsAtOnce` of the run, an `all` inside an `all` too; when one fails, the others stop at their next call.
 */
async function allDoor(
  s: Sequencing,
  list: unknown[],
  entry: (i: number) => unknown,
  at: number[],
): Promise<unknown[]> {
  const place = at.join('.')
  const walk = walked(s)
  const inside = walk.calls.filter((one) => placeOf(one.step).join('.').startsWith(`${place}.`))
  const first = inside.find((one) => one.asks && !one.agreed)
  if (first) await asked(s, at, first, walk, false)
  const run = (i: number) => async (): Promise<unknown> => {
    try {
      return await entry(i)
    } catch (error) {
      s.stopped.push(place)
      throw error
    }
  }
  // The sequence, or the entry the `all` stands in, gives its place up while its entries take theirs.
  return s.r.pool.waiting(() => Promise.all(list.map((_, i) => s.r.pool(run(i)))))
}

/** The three doors of one sequence, and the line of each statement as it is reached. */
export function doorsOf(s: Sequencing): SequenceDoors & { line(n: number): void } {
  return {
    tool: (name, input, at) => toolDoor(s, name, input, at),
    fill: (shape, prompt, at) => fillDoor(s, shape, prompt, at),
    all: (list, entry, at) => allDoor(s, list, entry, at),
    line: (n) => {
      s.line = n
    },
  }
}
