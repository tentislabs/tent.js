import { TentError } from '../../core/index.ts'
import type { Driver } from '../../flows/index.ts'
import type { AiEnv, Message } from '../face.ts'
import { written } from '../layer/writing.ts'
import { agentOf } from './agentOf.ts'
import type { ReadFile, Recalled } from './conversation.ts'
import { knowsText, messagesOfRows, readFiles } from './conversation.ts'
import type { ModelSaved } from './saved.ts'
import { isMessage, modelSavedOf, readFilesOf } from './saved.ts'
import { picturesOf } from './outside.ts'
import { sourceTools } from './sources.ts'
import { summarized } from './summary.ts'
import { heardMessage, spokenAnswer } from './voice.ts'
import { offeredTools, outsideSpec } from './tools.ts'
import { isStored, typedAnswers, wordsOf, projectZone } from '../../core/internal.ts'
import { requestStart, sequenceAfter, withEachOne } from './listed.ts'
import type { Running } from './running.ts'
import { poolOf, reached } from './running.ts'
import { toolCall } from './toolCall.ts'
import { answerTool, noAnswer, typedValue } from './answer.ts'
import { guardedAnswers, guardsOn, isRefusal, passedOut, refusedText } from './guards.ts'
import { handOverTool, handedTo, questionTool } from './person.ts'
import { hostedOf } from './hosted.ts'
import { reasoningFor, withReasoning } from './reasoning.ts'

/** One round of a run with no conversation: what the model answered, and what each tool it asked for answered. */
interface Round {
  saved: ModelSaved
  answers: Message[]
}

/** The input of a start: what the person says, the conversation, the files. A trigger's event is the message, as JSON. */
function startOf(
  input: unknown,
  event: unknown,
): { message: string; thread?: string; files: string[]; audio?: string; speak: boolean } {
  const given: Record<string, unknown> = isStored(input) ? input : {}
  const message = typeof given.message === 'string' ? given.message : event === undefined ? '' : JSON.stringify(event)
  return {
    message,
    ...(typeof given.thread === 'string' ? { thread: given.thread } : {}),
    files: Array.isArray(given.files) ? given.files.map(String) : [],
    ...(typeof given.audio === 'string' ? { audio: given.audio } : {}),
    speak: given.speak === true,
  }
}

/** The first message of a run with no conversation: what the person said, with the files of the start. */
async function firstMessage(r: Running, message: string, files: ReadFile[]): Promise<Message> {
  const images: { bytes: Uint8Array; kind: string }[] = []
  const words: string[] = [message]
  for (const file of files) {
    if (file.image) {
      images.push({
        bytes: await r.env.files.bytes(file.id, r.starter),
        kind: r.env.files.info(file.id, r.starter).kind,
      })
      continue
    }
    words.push(`File ${file.name}:\n${await r.env.files.text(file.id, r.starter)}`)
  }
  return { who: 'user', text: words.filter(Boolean).join('\n\n'), ...(images.length ? { images } : {}) }
}

/** The messages of the conversation as the model is sent them in a model step: from memory, or from this run's rounds. */
async function conversation(r: Running, first: Message, rounds: Round[], thread?: string): Promise<Message[]> {
  if (r.agent.memory && thread !== undefined) {
    const read: unknown = await r.env.call('_t_memoryRead', [
      { agent: r.agent.name, thread, ...(r.nearest.length ? { nearest: r.nearest } : {}) },
    ])
    const rows: Recalled[] = isStored(read) && Array.isArray(read.rows) ? read.rows : []
    // A call of a tool that is offered now is sent as a call: under the list that is `call`, and `sequence` where it is offered.
    const offered = new Set([
      ...(r.agent.tell === 'list' ? ['call'] : r.offered.map((one) => one.entry.told)),
      ...(r.told.sequence ? ['sequence'] : []),
      ...(r.agent.output ? [answerTool] : []),
      ...(r.agent.handsOver.length ? [handOverTool] : []),
      ...(r.agent.questions ? [questionTool] : []),
    ])
    return messagesOfRows(rows, offered, r.agent.words)
  }
  const messages = [first]
  for (const round of rounds) {
    messages.push({
      who: 'assistant',
      ...(round.saved.text ? { text: round.saved.text } : {}),
      ...(round.saved.calls.length ? { calls: round.saved.calls } : {}),
      ...(round.saved.keep === undefined ? {} : { keep: { by: round.saved.used.answeredBy, keep: round.saved.keep } }),
    })
    // The answers of the calls come first, and the pictures they gave after them, as a provider takes them.
    messages.push(
      ...round.answers.filter((one) => one.who === 'tool'),
      ...round.answers.filter((one) => one.who !== 'tool'),
    )
  }
  return messages
}

/**
 * Puts the engine's own messages before the newest message: the moment that `knows` names, the facts that are kept
 * of the person, and the older messages that were recalled for the run, each where it stands.
 */
function withOwn(r: Running, messages: Message[]): Message[] {
  const own: Message[] = []
  if (r.agent.knows.length) {
    const zone = projectZone(r.env.description(r.run.version).project)
    own.push({ who: 'user', text: knowsText(r.agent.knows, r.starter, r.run.startedAt, zone) })
  }
  const { words } = r.agent
  if (r.agent.facts !== undefined) {
    const read: unknown = r.env.call('_t_facts', [{ agent: r.agent.name }])
    const facts: unknown = Reflect.get(Object(read), 'facts')
    const lines = (Array.isArray(facts) ? facts : []).map(
      (one) => `${String(Reflect.get(Object(one), 'id'))}: ${String(Reflect.get(Object(one), 'fact'))}`,
    )
    if (lines.length) own.push({ who: 'user', text: [wordsOf(words, 'facts'), ...lines].join('\n') })
  }
  if (r.recalled.length)
    own.push({
      who: 'user',
      text: [wordsOf(words, 'recalled'), ...r.recalled.map((one) => `${one.who}: ${one.text}`)].join('\n'),
    })
  if (!own.length) return messages
  const newest = messages.findLastIndex((one) => one.who === 'user')
  if (newest < 0) return [...messages, ...own]
  return [...messages.slice(0, newest), ...own, ...messages.slice(newest)]
}

/** One `model` step: what is sent of the conversation, the instructions, the tools, and the call of the model. */
async function modelStep(r: Running, n: number, messages: Message[]): Promise<ModelSaved> {
  const name = `model ${n}`
  const tell = (part: object): void => r.env.tell(r.run.id, part)
  const reasoning = reasoningFor(r, name)
  const end = await written(
    {
      env: r.env,
      model: r.agent.model,
      method: 'reply',
      caller: r.starter,
      version: r.run.version,
      at: { run: r.run.id, step: name, repeat: 1 },
      signal: r.run.signal,
      ...(r.offered.length || r.agent.tell === 'list' || r.agent.output ? { also: ['tools'] } : {}),
    },
    { ...requestStart(r.told), hosted: r.hosted, messages: withOwn(r, messages) },
    {
      // Where `out` guards stand, no text reaches whoever follows the run before the guards have read it.
      shown: (text) => (r.agent.guards.out.length ? undefined : tell({ kind: 'text', step: name, text })),
      // A second model writes the answer anew: what the first wrote is dropped.
      anew: () => tell({ kind: 'again', step: name, repeat: 1 }),
      reasoning: reasoning.reasoning,
    },
  )
  const saved: ModelSaved = {
    text: end.text,
    calls: end.calls,
    used: { name: r.agent.model, answeredBy: end.by, units: end.units ?? {} },
    ...(end.keep === undefined ? {} : { keep: end.keep }),
  }
  return withReasoning(r, saved, reasoning.written())
}

/** The rows of a round that a conversation keeps: the agent's answer, and the answer of each tool. */
function roundRows(saved: ModelSaved, answers: Message[]): { who: string; text?: string; data?: unknown }[] {
  return [
    {
      who: 'assistant',
      ...(saved.text ? { text: saved.text } : {}),
      ...(saved.calls.length ? { data: { calls: saved.calls } } : {}),
    },
    ...answers
      .filter((answer) => answer.who === 'tool')
      .map((answer) => {
        const call = saved.calls.find((one) => one.id === answer.id)
        // The pictures that the answer gave the model are kept with its row, and given again with it.
        const files = picturesOf(answer)
        return {
          who: 'tool',
          data:
            answer.error !== undefined
              ? { id: answer.id, tool: call?.tool, error: answer.error }
              : { id: answer.id, tool: call?.tool, result: answer.result, ...(files.length ? { files } : {}) },
        }
      }),
  ]
}

/** What a step that adds one row to the conversation saves: `{ row }`, the id of that row. */
function oneRow(added: unknown): { row?: string } {
  const rows: unknown = isStored(added) ? added.rows : undefined
  return Array.isArray(rows) && typeof rows[0] === 'string' ? { row: rows[0] } : {}
}

/**
 * Where the memory shortens older turns and a summary is due, as `_t_memoryRead` says, writes it in a step of its
 * own and adds it to the conversation, covering the rows up to the last one it shortens.
 */
async function summaryWhenDue(r: Running, thread: string): Promise<void> {
  const shrink = r.agent.memory?.shrink
  // The nearest older turns are chosen anew each run: no summary is written of them.
  if (shrink !== 'summary' && (typeof shrink !== 'object' || 'nearest' in shrink)) return
  const read: unknown = await r.env.call('_t_memoryRead', [{ agent: r.agent.name, thread }])
  const due: Recalled[] = isStored(read) && Array.isArray(read.due) ? read.due : []
  if (!due.length) return
  const upTo = due.filter((row) => row.who !== 'summary').at(-1)?.id
  await r.step('summary', async () => {
    const text = await summarized({ env: r.env, agent: r.agent, run: r.run, starter: r.starter }, due)
    return oneRow(
      await r.env.call('_t_memoryAdd', [
        { agent: r.agent.name, thread, run: r.run.id, rows: [{ who: 'summary', text, data: { upTo } }] },
      ]),
    )
  })
}

/**
 * The answer of a turn, held to the `out` guards before it is kept or sent: the text, and the typed value where
 * there is one. Where a guard refuses, the person is answered `guards.refused`, and no value is answered.
 */
async function guardedEnd(r: Running, text: string, value?: unknown): Promise<{ text: string; value?: unknown }> {
  const told = [text, value === undefined ? '' : JSON.stringify(value)].filter(Boolean).join('\n')
  try {
    await guardsOn(r, 'out', '', told, 'assistant')
  } catch (error) {
    if (!isRefusal(error)) throw error
    return { text: refusedText(r) }
  }
  return value === undefined ? { text } : { text, value }
}

/** The rows of a round that a guard refused: the words the person was answered, and nothing the model wrote. */
const refusedRows = (r: Running): { who: string; text?: string }[] => [{ who: 'assistant', text: refusedText(r) }]

/**
 * Takes what the engine hands `ai` for an app. Answers the driver of an agent's run, which the runner calls for
 * every flow record that holds `agent`: it reads the files of the start, adds the message to the conversation,
 * calls the model in `model` steps, runs each tool it asks for in a step of its own - a person asked first where the
 * tool asks - with what the tool call may do, adds each round to the conversation, and answers `{ text }`. It holds
 * the run to `steps`, `time` and `toolCalls`, and tells whoever watches the run the text as it is written.
 */
export function agentDriver(env: AiEnv): Driver {
  return async (run) => {
    const agent = agentOf(Reflect.get(Object(run.record), 'name') ?? '', run.record, run.given)
    const description = env.description(run.version)
    const named = Object.entries(description.flows).find(([, flow]) => flow === run.record)?.[0]
    if (named) agent.name = named
    // Under a tool call whose leave is none a trusted tool asks: a run that a flow's step called keeps its trust.
    const called = run.leave === 'none'
    const sources = sourceTools(
      env,
      run.given,
      agent,
      { run: run.id, starter: run.starter, record: run.record },
      description,
      called,
    )
    // The outside servers of the run are looked at first, where a look is due: a tool held back is not offered.
    const servers = [...new Set(agent.tools.map((one) => one.tool.split('.')[0]))].filter((one) =>
      Boolean(description.services[one]?.mcp),
    )
    const held = servers.length && env.outside ? await env.outside(servers, run.starter.user?.id) : []
    const own = offeredTools(description, agent, called, held)
    const r: Running = {
      env,
      agent,
      run,
      starter: run.starter,
      // The tools of the sources stand after the agent's own.
      offered: [...own, ...sources.map((one) => one.offered)],
      sources,
      step: run.step,
      told: {
        description,
        agent,
        offered: [],
        called,
        specs: sources.map((one) => one.spec),
        // A sequence calls a tool of an outside server as any tool: it knows it by the spec its approval wrote.
        outside: own.filter((one) => one.kind === 'outside').map(outsideSpec),
        sequence: agent.sequence && env.read !== undefined,
        typed: typedAnswers(description, agent.name),
        after: sequenceAfter(description),
        held,
      },
      eachOne: { told: false },
      toolCalls: { n: 0 },
      fills: { n: 0 },
      pool: poolOf(agent.limits.toolsAtOnce),
      hosted: [],
      recalled: [],
      nearest: [],
      message: '',
    }
    r.told.offered = r.offered
    const { message: typed, thread, files, audio, speak } = startOf(run.input, run.event)
    const voicing = { env, agent, run, starter: run.starter, step: run.step }
    // A recording is heard first, and what was heard is put after what the person typed.
    const message = audio === undefined ? typed : await heardMessage(voicing, audio, typed)
    r.message = message
    const read = files.length
      ? await run.step('read', async () => ({ files: await readFiles(env, files, r.starter) }))
      : undefined
    const remembered = agent.memory !== undefined && thread !== undefined
    if (remembered)
      await run.step('remember', async () =>
        oneRow(
          await env.call('_t_memoryAdd', [
            {
              agent: agent.name,
              thread,
              run: run.id,
              rows: [{ who: 'user', text: message, ...(files.length ? { data: { files } } : {}) }],
            },
          ]),
        ),
      )
    if (remembered && thread !== undefined) await summaryWhenDue(r, thread)
    const first = await firstMessage(r, message, readFilesOf(read))
    const remember = (
      n: number | undefined,
      rows: { who: string; text?: string; data?: unknown }[],
    ): Promise<unknown> =>
      run.step(n === undefined ? 'remember answer' : `remember ${n}`, () =>
        env.call('_t_memoryAdd', [{ agent: agent.name, thread, run: run.id, rows }]),
      )
    // The person's message meets the `in` guards before the model reads it.
    try {
      await guardsOn(r, 'in', '1', message, 'person')
    } catch (error) {
      if (!isRefusal(error)) throw error
      if (remembered) await remember(undefined, refusedRows(r))
      return { text: refusedText(r) }
    }
    // The provider's own tools of the model, the older messages that are recalled, and the older turns of the
    // thread nearest to the message are settled once for the run.
    r.hosted = await hostedOf(r)
    const shrink = agent.memory?.shrink
    const nearest = typeof shrink === 'object' && 'nearest' in shrink
    if (remembered && thread !== undefined && (agent.memory?.recall || nearest)) {
      const read: unknown = await run.step('recall', () =>
        env.call('_t_recall', [{ agent: agent.name, thread, text: message }]),
      )
      const rows: unknown = Reflect.get(Object(read), 'rows')
      r.recalled = (Array.isArray(rows) ? rows : []).map((one) => ({
        who: String(Reflect.get(Object(one), 'who')),
        text: String(Reflect.get(Object(one), 'text')),
      }))
      const turns: unknown = Reflect.get(Object(read), 'nearest')
      r.nearest = Array.isArray(turns) ? turns.map(String) : []
    }
    const rounds: Round[] = []
    for (let n = 1; ; n++) {
      // A `fill` of a sequence counts on `steps` as a `model` step does.
      if (n + r.fills.n > agent.limits.steps) throw reached('steps', 'steps', agent.limits.steps)
      if (run.worked() > agent.limits.time) throw reached('time', 'ms', agent.limits.time)
      const saved = modelSavedOf(
        await run.step(`model ${n}`, async () => {
          try {
            return await modelStep(r, n, await conversation(r, first, rounds, thread))
          } catch (error) {
            // A conversation that does not fit the model is told so, with the way to make it fit.
            if (!remembered || !(error instanceof TentError) || error.code !== 'T7109') throw error
            throw new TentError(
              'T7101',
              `The conversation ${thread} has grown too long for the model: ${error.message}`,
              {
                fix: "Give the memory a `shrink`: 'drop' or 'summary' sends less of the older turns.",
              },
            )
          }
        }),
      )
      if (!saved.calls.length) {
        // An agent that states `output` answers through `answer` alone: prose is never passed off as a value,
        // and is kept nowhere, since no `out` guard read it.
        if (agent.output) throw noAnswer(agent.name)
        const end = await guardedEnd(r, saved.text)
        // The last round, which asked for no tool, is kept in the conversation as every round is.
        if (remembered) await remember(n, end.text === saved.text ? roundRows(saved, []) : refusedRows(r))
        // The answer is spoken after the last `model` step, where the start asks for it.
        if (speak) await spokenAnswer(voicing, end.text)
        return end
      }
      r.toolCalls.n += saved.calls.length
      if (r.toolCalls.n > agent.limits.toolCalls) throw reached('toolCalls', 'calls', agent.limits.toolCalls)
      // A sequence takes its place as any tool does, and gives it up while the entries of an `all` of it work.
      const done = await run.step.all(saved.calls, (call, i) => r.pool(() => toolCall(r, n, i + 1, call)))
      // The answers of tools from outside the app meet the `in` guards before the model reads them.
      const guarded = await guardedAnswers(
        r,
        n,
        saved.calls,
        withEachOne(r.told, done.flat().filter(isMessage), r.eachOne),
      )
      const { answers } = guarded
      // The first call of `answer` whose value fits its type ends the run with that value.
      const typed = agent.output
        ? saved.calls
            .filter((call) => call.tool === answerTool)
            .map((call) => typedValue(agent, call))
            .find((one) => 'value' in one)
        : undefined
      if (typed && 'value' in typed && !guarded.refused) {
        const end = await guardedEnd(r, saved.text, typed.value)
        if (remembered) await remember(n, 'value' in end ? roundRows(saved, answers) : refusedRows(r))
        return end
      }
      // A hand-over ends the run: from the write that ends it the other agent holds the conversation.
      const to = handedTo(saved.calls, answers)
      if (to !== undefined) run.handOver(to)
      // A round that a guard refused, of what came in or of what the model wrote beside its calls, ends the turn,
      // and is kept nowhere: neither what the guard read nor what the model wrote with it.
      if (guarded.refused || !(await passedOut(r, String(n), saved.text))) {
        if (remembered) await remember(undefined, refusedRows(r))
        return { text: refusedText(r) }
      }
      if (remembered) await remember(n, roundRows(saved, answers))
      if (to !== undefined) return { text: saved.text || wordsOf(agent.words, 'handedOver', to) }
      rounds.push({ saved, answers })
    }
  }
}
