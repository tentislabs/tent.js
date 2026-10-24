import { TentError } from '../../core/index.ts'
import { checkSequence, runBody, sequenceShape } from '../../core/internal.ts'
import type { Message, ToolCall } from '../face.ts'
import type { Running } from './running.ts'
import type { Sequencing } from './sequenceDoors.ts'
import { doorsOf, passed } from './sequenceDoors.ts'
import { doneList, failedText } from './sequenceDone.ts'

/** Why a sequence was refused before anything of it ran: the code, the message, and the line. */
interface Refused {
  code: string
  message: string
  line: number
}

/** The tools that a stored sequence calls, by the names they are told under. */
function calledIn(node: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) for (const one of node) calledIn(one, found)
  else if (typeof node === 'object' && node !== null) {
    const call: unknown = Reflect.get(node, 'call')
    const tool: unknown = Reflect.get(Object(call), 'tool')
    if (typeof tool === 'string') found.add(tool)
    for (const value of Object.values(node)) calledIn(value, found)
  }
  return found
}

const refusal = (code: string, message: string, line: number): { refused: Refused } => ({
  refused: { code, message, line },
})

/**
 * Reads a sequence once, in its step: the text into its stored form, held to the shape of a sequence; its names
 * and its types checked; and the rule of each tool it names asked for the starter, as far as it can be. Answers
 * `{ body }`, or `{ refused }` with the first thing that refuses it.
 */
async function readOnce(r: Running, text: string): Promise<{ body: object[] } | { refused: Refused }> {
  const read = r.env.read
  if (!read) return refusal('T7121', 'No reader of source is at hand here: call the tools one at a time.', 1)
  const tools = r.offered.map((one) => one.entry.told)
  const made = await read(text, { tools, fill: r.told.typed })
  if ('why' in made) return refusal('T7121', `A sequence may not hold ${made.why}, on line ${made.line}.`, made.line)
  const [miss] = sequenceShape(made.body)
  if (miss) return refusal('T7121', `A sequence may not hold ${miss}.`, 1)
  const [found] = checkSequence(r.told.description, r.agent.name, made.body, {
    specs: [...r.told.specs, ...r.told.outside],
  })
  if (found) return refusal(found.code, found.message, Number(/on line (\d+)/.exec(found.message)?.[1] ?? 1))
  for (const told of calledIn(made.body)) {
    const tool = r.offered.find((one) => one.entry.told === told)
    if (tool && tool.kind !== 'source' && r.env.may(tool.entry.tool) === false)
      return refusal('T3101', `The sequence calls ${told}, which the starter may not use.`, 1)
  }
  return { body: made.body }
}

/** Whether what ended a sequence ends the run: a limit of the run itself. */
const endsRun = (error: unknown): boolean =>
  error instanceof TentError && error.code === 'T7102' && error.fields?.limit === 'perRun'

/**
 * Takes a run, the numbers of the `model` step and of the call among the tools of its answer, and the call of
 * `sequence`. Reads the sequence in the step `sequence N.P`, which every later pass reads, and carries it out with
 * every call a step of its own. Answers what the model is handed: what the sequence returned, held to
 * `limits.result`; what was done where it returned nothing; and the error with its line and what was done where a
 * call failed, the sequence called `fail`, or what it returned is too large.
 */
export async function sequenceCall(r: Running, n: number, m: number, call: ToolCall): Promise<Message> {
  const text = String(Reflect.get(Object(call.input), 'run') ?? '')
  const read: unknown = await r.step(`sequence ${n}.${m}`, async () => readOnce(r, text))
  const refused: unknown = Reflect.get(Object(read), 'refused')
  if (refused) {
    const { code, message } = Object(refused)
    return { who: 'tool', id: call.id, error: `Error ${String(code)}: ${String(message)}` }
  }
  const body: unknown = Reflect.get(Object(read), 'body')
  const s: Sequencing = {
    r,
    n,
    m,
    body: Array.isArray(body) ? body : [],
    saved: {},
    made: [],
    agreed: [],
    line: 1,
    since: performance.now(),
    stopped: [],
  }
  const { words, limits } = r.agent
  try {
    const value: unknown = await runBody(s.body, {}, { sequence: doorsOf(s), tick: () => passed(s) })
    if (value === undefined) return { who: 'tool', id: call.id, result: doneList(s.made, limits.result) }
    if (JSON.stringify(value).length > limits.result)
      return {
        who: 'tool',
        id: call.id,
        error: failedText(new TentError('T5102', 'too large'), s.line, s.made, { words, result: limits.result }),
      }
    return { who: 'tool', id: call.id, result: value }
  } catch (error) {
    if (endsRun(error)) throw error
    return { who: 'tool', id: call.id, error: failedText(error, s.line, s.made, { words, result: limits.result }) }
  }
}
