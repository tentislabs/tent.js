import { TentError } from '../../core/index.ts'
import { fromOutside, wordsOf } from '../../core/internal.ts'
import type { Message, ToolCall } from '../face.ts'
import type { GuardOf } from './agentOf.ts'
import { judgedIn } from './judged.ts'
import type { Running } from './running.ts'

/** Who wrote a text that a guard is handed: the person, a tool, or the agent's answer. */
type From = 'person' | 'tool' | 'assistant'

/** The error of a guard that did not pass: it names the guard and its reason. */
const refusedBy = (guard: string, why: string | undefined): TentError =>
  new TentError('T7131', `The guard ${guard} refused it: ${why ?? 'it gave no reason'}.`, {
    fields: { guard, ...(why === undefined ? {} : { why }) },
    fix: 'Read why the guard refused, and change what the run was handed or the guard itself.',
  })

/** Whether an error is the refusal of a guard. */
export const isRefusal = (error: unknown): error is TentError => error instanceof TentError && error.code === 'T7131'

/** What one guard says of a text: a definition is called with `{ text, from }`, and a guard of the engine's own through the engine. */
async function saidBy(r: Running, step: string, guard: GuardOf, text: string, from: From): Promise<unknown> {
  // A judge passes where its score reaches its `pass`: the task is the message of the turn, the answer the text.
  if (guard.judge) {
    const judged = await judgedIn(r, guard.judge, step, r.message, text)
    return judged.score >= guard.judge.pass ? { pass: true } : { pass: false, why: judged.why }
  }
  return guard.ours ? r.env.call('_t_guard', [{ guard: guard.name, text }]) : r.env.call(guard.name, [{ text, from }])
}

/**
 * Runs one guard on a text, as a saved step of the run, as its starter. A guard that does not pass, or that fails,
 * fails its step with T7131, which the caller of this catches: what is not seen to pass does not pass.
 */
async function guarded(r: Running, step: string, guard: GuardOf, text: string, from: From): Promise<void> {
  await r.step(
    step,
    async () => {
      let said: unknown
      try {
        said = await saidBy(r, step, guard, text, from)
      } catch (error) {
        const code: unknown = Reflect.get(Object(error), 'code')
        throw refusedBy(guard.name, `the guard failed with ${typeof code === 'string' ? code : 'an error'}`)
      }
      if (Reflect.get(Object(said), 'pass') === true) return { pass: true }
      const why: unknown = Reflect.get(Object(said), 'why')
      throw refusedBy(guard.name, typeof why === 'string' ? why : undefined)
    },
    { tries: 1 },
  )
}

/**
 * Takes a run, which side of its guards, the place of the text in the run, the text and who wrote it. Runs each
 * guard of that side on it in turn, in a step `guard <side> <place> <guard>`, and throws the T7131 of the first that
 * does not pass.
 */
export async function guardsOn(r: Running, side: 'in' | 'out', place: string, text: string, from: From): Promise<void> {
  for (const guard of r.agent.guards[side])
    await guarded(r, ['guard', side, place, guard.name].filter(Boolean).join(' '), guard, text, from)
}

/** The text of a tool's answer as a guard is handed it: what the model would read, its error among it. */
const textOf = (answer: Message): string =>
  answer.error !== undefined
    ? answer.error
    : typeof answer.result === 'string'
      ? answer.result
      : JSON.stringify(answer.result ?? null)

/** The tool that a call names: under the list the one that `call` names by its name, and else its own. */
const toolOf = (call: ToolCall): string =>
  call.tool === 'call' && typeof Reflect.get(Object(call.input), 'name') === 'string'
    ? String(Reflect.get(Object(call.input), 'name'))
    : call.tool

/**
 * Whether the answer of a tool came from outside the app, by the marks: a tool of an outside server, a tool of a
 * source, and a definition that takes in text from outside or reaches one that does. A sequence hands back what
 * its calls answered, so it counts where any tool of the agent takes in text from outside.
 */
function outside(r: Running, tool: string): boolean {
  const description = r.env.description(r.run.version)
  if (tool === 'sequence') return r.offered.some((one) => outside(r, one.entry.told))
  const offered = r.offered.find((one) => one.entry.told === tool)
  if (!offered) return false
  if (offered.kind === 'outside' || offered.kind === 'source') return true
  return fromOutside(description, offered.entry.tool)
}

/**
 * Takes a run, the number of the `model` step whose calls these answer, the calls and their answers. Runs the `in`
 * guards on each answer, and each error, that came from outside the app, before the model sees it. Answers the
 * answers, with the one that a guard refused in place of its own, and the T7131 that ends the turn, where one refused.
 */
export async function guardedAnswers(
  r: Running,
  n: number,
  calls: ToolCall[],
  answers: Message[],
): Promise<{ answers: Message[]; refused?: TentError }> {
  if (!r.agent.guards.in.length) return { answers }
  const kept: Message[] = []
  let refused: TentError | undefined
  for (const answer of answers) {
    const at = calls.findIndex((call) => call.id === answer.id)
    const call = calls[at]
    if (refused || answer.who !== 'tool' || !call || !outside(r, toolOf(call))) {
      kept.push(answer)
      continue
    }
    try {
      await guardsOn(r, 'in', `${n}.${at + 1}`, textOf(answer), 'tool')
      kept.push(answer)
    } catch (error) {
      if (!isRefusal(error)) throw error
      refused = error
      // What a guard refused is kept from the model in every later turn too.
      kept.push({ who: 'tool', id: answer.id, error: `Error T7131: ${wordsOf(r.agent.words, 'guarded')}` })
    }
  }
  return { answers: kept, ...(refused ? { refused } : {}) }
}

/**
 * Holds a text that the model wrote to the `out` guards before anything of it is sent, shown or kept: the text of
 * a round that calls tools, and a question to the person. Answers whether it passed.
 */
export async function passedOut(r: Running, place: string, text: string): Promise<boolean> {
  if (!r.agent.guards.out.length || !text) return true
  try {
    await guardsOn(r, 'out', place, text, 'assistant')
    return true
  } catch (error) {
    if (!isRefusal(error)) throw error
    return false
  }
}

/** What the person is answered where a guard refused: `guards.refused`, or the engine's words. */
export const refusedText = (r: Running): string => r.agent.guards.refused ?? wordsOf(r.agent.words, 'guarded')
