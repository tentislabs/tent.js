import { TentError } from '../core/index.ts'
import { isStored } from '../core/internal.ts'
import type { Provider, ReplyPart, ReplyRequest, Units } from '../engine/index.ts'
import { ProviderFailure } from '../engine/index.ts'

/** One answer of a faked model: its text, the tools it asks for, a typed value, its reasoning, its parts, what it used, a failure. */
export interface FakeAnswer {
  text?: string
  calls?: { tool: string; with?: unknown }[]
  value?: unknown
  reasoning?: string | string[]
  parts?: number | number[]
  units?: Units
  fail?: ProviderFailure['kind']
}

/** What a model is faked with: a list of answers, a function of the request, or the answers of its other calls. */
export type ModelAnswers =
  | FakeAnswer[]
  | ((request: ReplyRequest) => FakeAnswer | Promise<FakeAnswer>)
  | {
      reply?: FakeAnswer[] | ((request: ReplyRequest) => FakeAnswer | Promise<FakeAnswer>)
      embed?: (text: string) => number[] | Promise<number[]>
      hear?: (o: { kind: string; language?: string; hint?: string }) => {
        text: string
        language?: string
        seconds?: number
      }
      speak?: (text: string) => Uint8Array | Promise<Uint8Array>
      rank?: (words: string, texts: string[]) => number[] | Promise<number[]>
      call?: (input: unknown) => unknown
    }

/** What a faked model was sent, in order: each call with what it was handed, the key and the fetch left out. */
export interface FakedModel {
  readonly sent: { call: string; input: unknown }[]
}

/** The units a fake answered, each a number: what is no number is no unit. */
const unitsOf = (record: Record<string, unknown>): Units =>
  Object.fromEntries(Object.entries(record).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))

/** The JSON text of a value cut into parts: as many as `parts` says, 3 when left out, or at the places it lists. */
function cut(text: string, parts: number | number[] | undefined): string[] {
  const places = Array.isArray(parts)
    ? parts.filter((at) => at > 0 && at < text.length).sort((a, b) => a - b)
    : Array.from({ length: Math.max(1, parts ?? 3) - 1 }, (_, i) =>
        Math.round(((i + 1) * text.length) / Math.max(1, parts ?? 3)),
      )
  const pieces: string[] = []
  let from = 0
  for (const at of [...places, text.length]) {
    if (at > from) pieces.push(text.slice(from, at))
    from = Math.max(from, at)
  }
  return pieces
}

/** The parts of one faked answer, as a provider gives them: its reasoning, its text, and its end, or its failure. */
async function* partsOf(answer: FakeAnswer, request: ReplyRequest, n: () => number): AsyncGenerator<ReplyPart> {
  const reasoning =
    answer.reasoning === undefined ? [] : Array.isArray(answer.reasoning) ? answer.reasoning : [answer.reasoning]
  for (const one of reasoning) yield { reasoning: one }
  const typed = request.shape !== undefined && answer.value !== undefined
  const text = typed ? JSON.stringify(answer.value) : (answer.text ?? '')
  if (typed) for (const piece of cut(text, answer.parts)) yield { text: piece }
  else if (text !== '') yield { text }
  if (answer.fail) throw new ProviderFailure(answer.fail, `The fake failed as it was told: ${answer.fail}.`)
  const calls = (answer.calls ?? []).map((call) => ({ id: `call-${n()}`, tool: call.tool, input: call.with ?? {} }))
  yield {
    end: {
      text,
      calls,
      ...(answer.value === undefined ? {} : { value: answer.value }),
      ...(answer.units ? { units: answer.units } : {}),
    },
  }
}

/**
 * Takes the name of a model and what it is faked with. Answers the fake, which is a provider and stands in the
 * place of the model's own, and what it was sent. Of a list, each answer is given to one step of one run, or to one
 * call made outside a run, in the order those first ask, and a step that runs again gets the answer it got before.
 * No provider is called.
 */
export function fakeModel(model: string, answers: ModelAnswers): { provider: Provider; faked: FakedModel } {
  const faked: FakedModel = { sent: [] }
  const given = new Map<string, number>()
  let next = 0
  let calls = 0
  const replies = Array.isArray(answers) || typeof answers === 'function' ? answers : answers.reply
  const others = Array.isArray(answers) || typeof answers === 'function' ? {} : answers
  const answerOf = async (request: ReplyRequest): Promise<FakeAnswer> => {
    if (typeof replies === 'function') return replies(request)
    if (!replies) throw new TentError('T0013', `The fake of the model ${model} gives no answer to write.`)
    const at = request.at ? `${request.at.run}\n${request.at.step}\n${request.at.repeat}` : undefined
    const held = at === undefined ? undefined : given.get(at)
    const index = held ?? next++
    if (at !== undefined && held === undefined) given.set(at, index)
    const answer = replies[index]
    if (!answer)
      throw new TentError('T0013', `The fake of the model ${model} has no answer left: it holds ${replies.length}.`, {
        fix: `Give \`app.fake(${model}, [...])\` one more answer.`,
      })
    return answer
  }
  const shown = (request: object): object => {
    const { fetch: _fetch, signal: _signal, key: _key, ...rest } = Object(request)
    return rest
  }
  const provider: Provider = {
    async *reply(request) {
      faked.sent.push({ call: 'reply', input: shown(request) })
      yield* partsOf(await answerOf(request), request, () => ++calls)
    },
    async embed(o) {
      faked.sent.push({ call: 'embed', input: shown(o) })
      if (!others.embed) throw new TentError('T0013', `The fake of the model ${model} gives no vectors.`)
      const vectors: number[][] = []
      for (const text of o.texts) vectors.push(await others.embed(text))
      return { vectors }
    },
    async hear(o) {
      faked.sent.push({ call: 'hear', input: shown(o) })
      if (!others.hear) throw new TentError('T0013', `The fake of the model ${model} hears nothing.`)
      const heard = others.hear({
        kind: o.kind,
        ...(o.language === undefined ? {} : { language: o.language }),
        ...(o.hint === undefined ? {} : { hint: o.hint }),
      })
      return { text: heard.text, seconds: heard.seconds ?? 0, ...(heard.language ? { language: heard.language } : {}) }
    },
    async speak(o) {
      faked.sent.push({ call: 'speak', input: shown(o) })
      if (!others.speak) throw new TentError('T0013', `The fake of the model ${model} speaks nothing.`)
      return { audio: await others.speak(o.text) }
    },
    async rank(o) {
      faked.sent.push({ call: 'rank', input: shown(o) })
      if (!others.rank) throw new TentError('T0013', `The fake of the model ${model} ranks nothing.`)
      return { scores: await others.rank(o.words, o.texts) }
    },
    async call(o) {
      faked.sent.push({ call: 'call', input: o.input })
      if (!others.call) throw new TentError('T0013', `The fake of the model ${model} answers no call.`)
      const answered: unknown = await others.call(o.input)
      // A fake answers `{ output, units }`, as a provider does, or its output alone, which used no unit.
      const whole =
        isStored(answered) &&
        Object.hasOwn(answered, 'output') &&
        Object.keys(answered).every((key) => key === 'output' || key === 'units')
      if (!whole) return { output: answered }
      const units = answered.units
      return { output: answered.output, ...(isStored(units) ? { units: unitsOf(units) } : {}) }
    },
  }
  // A fake of a model that only writes, or that is only a function, has the members of that and no others.
  if (!isStored(answers) || Array.isArray(answers))
    for (const name of ['embed', 'hear', 'speak', 'rank', 'call']) Reflect.deleteProperty(provider, name)
  else
    for (const name of ['reply', 'embed', 'hear', 'speak', 'rank', 'call'])
      if (!Object.hasOwn(answers, name)) Reflect.deleteProperty(provider, name)
  return { provider, faked }
}
