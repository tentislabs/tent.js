import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { AiEnv } from '../face.ts'
import { written } from '../layer/writing.ts'
import type { AgentOf } from './agentOf.ts'
import type { Recalled } from './conversation.ts'
import { wordsOf } from '../../core/internal.ts'

/** Where a summary is written: the env, the agent, the run, its starter and its version, and what ends it. */
interface Summing {
  env: AiEnv
  agent: AgentOf
  run: { id: string; version: string; signal: AbortSignal }
  starter: Caller
}

/** The rows of a conversation as the words of a summary take them: `<who>: <text>`, each on a line of its own. */
const linesOf = (rows: Recalled[]): string =>
  rows.map((row) => `${row.who}: ${row.text ?? JSON.stringify(row.data ?? '')}`).join('\n')

/** Whether an error is a request over what the model takes. */
const tooLarge = (error: unknown): boolean => error instanceof TentError && error.code === 'T7109'

/** The rows cut into turns, each from a person's message up to the next one: a summary stands as a turn of its own. */
function turnsOf(rows: Recalled[]): Recalled[][] {
  const turns: Recalled[][] = []
  for (const row of rows) {
    const last = turns.at(-1)
    if (!last || row.who === 'user' || row.who === 'summary' || last[0].who === 'summary') turns.push([row])
    else last.push(row)
  }
  return turns
}

/** One request of a summary to the model that writes it: its text, or nothing where the request would not fit. */
async function asked(s: Summing, model: string, rows: Recalled[]): Promise<string | undefined> {
  try {
    const end = await written(
      {
        env: s.env,
        model,
        method: 'reply',
        caller: s.starter,
        version: s.run.version,
        at: { run: s.run.id, step: 'summary', repeat: 1 },
        signal: s.run.signal,
      },
      { messages: [{ who: 'user', text: `${wordsOf(s.agent.words, 'summary')}\n\n${linesOf(rows)}` }] },
    )
    return end.text
  } catch (error) {
    if (tooLarge(error)) return undefined
    throw error
  }
}

/**
 * Takes where a summary is written and the rows it shortens, the latest summary first where there is one. Answers
 * the text of the summary: what the builder's own action or flow in `shrink` answers when it is handed `{ rows }`,
 * or what the memory's model writes in the engine's words. A request that would not fit the model is made in
 * parts: as many of the oldest turns as fit are shortened first, and the result stands in for them in the next
 * request. Throws T7109 where no part is left that the model takes.
 */
export async function summarized(s: Summing, rows: Recalled[]): Promise<string> {
  const memory = s.agent.memory
  const shrink = memory?.shrink
  if (typeof shrink === 'object' && !('nearest' in shrink)) {
    const named = 'function' in shrink ? shrink.function : shrink.flow
    return String(await s.env.call(named, [{ rows }]))
  }
  const model = memory?.model ?? s.agent.model
  let turns = turnsOf(rows)
  for (;;) {
    // The size of a request is held before it is sent, so a part that does not fit costs no call of the model.
    let n = turns.length
    let text: string | undefined
    for (; n > 0 && text === undefined; n--) text = await asked(s, model, turns.slice(0, n).flat())
    n += 1
    if (text !== undefined && n === turns.length) return text
    const part = turns.slice(0, n).flat()
    // A summary that stands alone and is shortened again leaves the next request as large as it was.
    const alone = n === 1 && part.length === 1 && part[0].who === 'summary'
    if (text === undefined || alone)
      throw new TentError('T7109', `The model ${model} takes no part of the conversation that its summary shortens.`, {
        fix: 'Give the memory a model that takes more, or keep the turns of the conversation shorter.',
      })
    turns = [[{ id: part[part.length - 1].id, who: 'summary', text }], ...turns.slice(n)]
  }
}
