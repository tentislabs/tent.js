import type { Type } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { checkValue, toJsonSchema } from '../../core/internal.ts'
import type { Message, Provider, ReplyEnd, ReplyRequest } from '../face.ts'
import { ProviderFailure } from '../../core/internal.ts'
import type { Asking, Tally } from './ask.ts'
import { ask } from './ask.ts'
import type { ModelOf } from './record.ts'
import { cannot } from './record.ts'
import { handedUnder, mappedBack, namesOf } from './names.ts'
import { sizeByRule, tokensOf } from './size.ts'

/** What a call that writes is handed beside its request: where its parts go, as they arrive. */
export interface Writing {
  // A part of the text, as it arrives.
  text?(part: string): void
  // A part of the model's reasoning, or `null` where the call began anew after reasoning alone.
  reasoning?(part: string | null): void
  // A part of the text that is shown to whoever watches, which gives nothing to the caller: a second model may
  // still answer, and `anew` is then told first.
  shown?(part: string): void
  anew?(): void
}

/** A message whose kept part is handed back to the model that made it, and to no other. */
function keptFor(message: Message, model: string): Message {
  const held: unknown = message.keep
  if (held === undefined) return message
  const { keep: _, ...rest } = message
  const by: unknown = Reflect.get(Object(held), 'by')
  return by === model ? { ...rest, keep: Reflect.get(Object(held), 'keep') } : rest
}

/** What a request is before the provider's own members are put to it. */
export type Asked = Omit<ReplyRequest, 'fetch' | 'signal' | 'model' | 'key' | 'at'>

/** The error of a request over what a model takes. */
const tooLarge = (model: string, count: number, takes: number): TentError =>
  new TentError('T7109', `The request to the model ${model} holds ${count} tokens, over the ${takes} it takes.`, {
    fix: 'Send less: a shorter text, fewer files, or a shorter conversation.',
  })

/** Counts what the server did not report, by the rule, and the call itself. */
function countedByRule(tally: Tally, request: Asked, text: string): void {
  tally.units.calls = 1
  if (tally.units.tokensIn === undefined) {
    tally.units.tokensIn = sizeByRule(request)
    tally.counted.push('tokensIn')
  }
  if (tally.units.tokensOut === undefined) {
    tally.units.tokensOut = tokensOf(text)
    tally.counted.push('tokensOut')
  }
}

/**
 * Takes a model call that writes, the request and where its parts go. Asks the model through its provider's
 * `reply`, held to its size, and answers the end of the answer that worked. Counts the units the server reported,
 * and by the rule those it did not. Where reasoning was given and the call begins anew, `reasoning` is told `null`.
 */
export async function written(
  asking: Asking,
  request: Asked,
  to: Writing = {},
): Promise<ReplyEnd & { by: string; units: Record<string, number> }> {
  let reasoningGiven = false
  let shownGiven = false
  // A tool is handed to the provider under a name it takes, and the calls of the answer come back under its own.
  const names = request.tools?.length ? namesOf(request.tools) : undefined
  const handed = names ? handedUnder(request, names) : request
  return ask(asking, async ({ provider, model, base, tally, first }) => {
    if (!provider.reply) throw cannot(model.name, 'a reply')
    if (reasoningGiven) {
      reasoningGiven = false
      to.reasoning?.(null)
    }
    if (shownGiven) {
      shownGiven = false
      to.anew?.()
    }
    // The provider's own tools are those this model names: a request that names some offers those of them alone.
    const own = Array.isArray(model.stored.hosted) ? model.stored.hosted.map(String) : []
    const { hosted: asked, ...rest } = handed
    const hosted = asked ? asked.filter((one) => own.includes(one)) : own
    const whole: ReplyRequest = {
      ...base,
      ...rest,
      ...(hosted.length ? { hosted } : {}),
      messages: handed.messages.map((one) => keptFor(one, model.name)),
    }
    await held(provider, model, whole)
    let text = ''
    try {
      for await (const part of provider.reply(whole)) {
        first()
        if ('text' in part) {
          text += part.text
          if (to.text) {
            tally.given = true
            to.text(part.text)
          }
          if (to.shown) {
            shownGiven = true
            to.shown(part.text)
          }
        } else if ('reasoning' in part) {
          reasoningGiven = true
          to.reasoning?.(part.reasoning)
        } else if ('end' in part) {
          Object.assign(tally.units, part.end.units ?? {})
          if (part.end.raw !== undefined) tally.raw = part.end.raw
          countedByRule(tally, request, part.end.text || text)
          return { ...(names ? mappedBack(part.end, names) : part.end), by: model.name, units: { ...tally.units } }
        }
      }
    } catch (error) {
      countedByRule(tally, request, text)
      throw error
    }
    countedByRule(tally, request, text)
    throw new ProviderFailure('server', 'The answer ended with no end.')
  })
}

/** Holds a request to what the model takes: by the provider's own count where it has one, and by the rule otherwise. */
async function held(provider: Provider, model: ModelOf, request: ReplyRequest): Promise<void> {
  if (model.takes === undefined) return
  const count = provider.size ? await provider.size(request) : sizeByRule(request)
  if (count > model.takes) throw tooLarge(model.name, count, model.takes)
}

/** The type of a shape that `fill` is handed: one type, or a record of types, which is an object of them. */
export function typeOfShape(shape: unknown): Type {
  const record: Record<string, unknown> = Object(shape)
  if (typeof record.kind === 'string') return Object(shape)
  return { kind: 'object', shape: Object(shape) }
}

/** The value of a typed answer: what the provider read itself, or the JSON of its text, past any words around it. */
export function valueOfAnswer(end: ReplyEnd): unknown {
  if (end.value !== undefined) return end.value
  const text = end.text
  const start = text.search(/[{[]/)
  if (start < 0) return undefined
  const close = text[start] === '{' ? '}' : ']'
  const stop = text.lastIndexOf(close)
  try {
    return JSON.parse(text.slice(start, stop + 1))
  } catch {
    return undefined
  }
}

/** The words of what does not fit, as the model is told them when it is asked once more. */
export function misfitOf(type: Type, value: unknown): string | undefined {
  if (value === undefined) return 'The answer held no JSON value.'
  const found = checkValue(type, value)
  return found.length ? found.map((one) => one.message).join(' ') : undefined
}

/**
 * Takes a model call, the shape of a typed answer and the request. Asks the model for a value of that shape, and
 * checks the answer against it: one that does not fit is asked for once more, with the error, and a second miss is
 * T7108. Answers the value.
 */
export async function filled(asking: Asking, shape: unknown, request: Asked, to: Writing = {}): Promise<unknown> {
  const type = typeOfShape(shape)
  const schema = toJsonSchema(type)
  const first = await written(asking, { ...request, shape: schema }, to)
  const value = valueOfAnswer(first)
  const miss = misfitOf(type, value)
  if (miss === undefined) return value
  const messages: Message[] = [
    ...request.messages,
    { who: 'assistant', text: first.text || JSON.stringify(value ?? null) },
    { who: 'user', text: `That answer does not fit the shape: ${miss} Answer again, with a value that fits.` },
  ]
  const again = await written({ ...asking, only: first.by }, { ...request, messages, shape: schema }, to)
  const second = valueOfAnswer(again)
  const missed = misfitOf(type, second)
  if (missed === undefined) return second
  throw new TentError(
    'T7108',
    `The answer of the model ${first.by} did not fit its shape, also at the second try: ${missed}`,
    {
      fix: 'Write a shape that the model can fill, or ask a model that keeps to it.',
    },
  )
}
