import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { AiEnv, CallAt, Message, Method } from '../face.ts'
import type { Asking } from './ask.ts'
import { canDo, cannot, modelOf } from './record.ts'
import { calledAsFunction } from './asFunction.ts'
import { embedded, heardFile, rankedTexts, spokenText } from './fixed.ts'
import { streamed } from './streamed.ts'
import { filled, written } from './writing.ts'

/** What a model call from app code is: the model, the call, its values, its caller, its version, where and what ends it. */
export interface ModelCallOf {
  model: string
  method: Method
  args: unknown[]
  caller: Caller
  version: string
  at?: CallAt
  signal: AbortSignal
}

const methods: readonly string[] = ['reply', 'stream', 'fill', 'embed', 'hear', 'speak', 'rank', 'call']

/** The options of a fixed call, which may be left out. */
const optionsOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? Object(value) : {}

/**
 * The first message of a call that writes: the prompt, and the pictures of the files it names, which are read once
 * the model is known to take them.
 */
async function promptOf(asking: Asking, prompt: unknown, o: Record<string, unknown>): Promise<Message> {
  if (typeof prompt !== 'string') throw new TentError('T0002', 'The prompt of a model call is a text.')
  const asked = modelOf(asking.env.description(asking.version), asking.model)
  if (!canDo(asked, asking.method, asking.also)) throw cannot(asked.name, asking.method)
  const ids = Array.isArray(o.images) ? o.images.map(String) : []
  const images = await Promise.all(
    ids.map(async (id) => ({
      bytes: await asking.env.files.bytes(id, asking.caller),
      kind: asking.env.files.info(id, asking.caller).kind,
    })),
  )
  return { who: 'user', text: prompt, ...(images.length ? { images } : {}) }
}

/** The function a call states for the reasoning of the model, where it states one. */
const reasoningOf = (o: Record<string, unknown>): ((part: string | null) => void) | undefined =>
  typeof o.reasoning === 'function' ? (part) => void Reflect.apply(Object(o.reasoning), undefined, [part]) : undefined

/**
 * Takes what the engine hands `ai` and a model call that app code made: `writer.reply(...)`, which is
 * `runtime.call('writer.reply', [...])`, and the model itself for one that is a function. Carries the call out
 * through the model layer: the abilities, the limits, the tries, a second provider, the size and the time, the
 * counting and the log, files, and a long job that a step keeps. Answers a promise of what the call answers, and
 * for `stream` the parts as they arrive. Throws T7001 for what the model cannot do, and the codes of the layer.
 */
export function modelCall(env: AiEnv, o: ModelCallOf): unknown {
  if (!methods.includes(o.method)) throw new TentError('T0001', `A model has no call named ${o.method}.`)
  const images = (value: unknown): string[] => (Array.isArray(optionsOf(value).images) ? ['images'] : [])
  const asking: Asking = {
    env,
    model: o.model,
    method: o.method,
    caller: o.caller,
    version: o.version,
    signal: o.signal,
    ...(o.at ? { at: o.at } : {}),
  }
  const [first, second, third] = o.args
  switch (o.method) {
    case 'reply':
      return (async () => {
        const options = optionsOf(second)
        const reasoning = reasoningOf(options)
        const message = await promptOf({ ...asking, also: images(second) }, first, options)
        const end = await written(
          { ...asking, also: images(second) },
          { messages: [message] },
          reasoning ? { reasoning } : {},
        )
        return end.text
      })()
    case 'stream':
      return streamed({ ...asking, also: images(second) }, first, optionsOf(second), (prompt, options) =>
        promptOf({ ...asking, also: images(second) }, prompt, options),
      )
    case 'fill':
      return (async () => {
        const options = optionsOf(third)
        const reasoning = reasoningOf(options)
        const message = await promptOf({ ...asking, also: images(third) }, second, options)
        return filled(
          { ...asking, also: images(third) },
          first,
          { messages: [message] },
          reasoning ? { reasoning } : {},
        )
      })()
    case 'embed':
      return embedded(asking, first)
    case 'hear':
      return heardFile(asking, first, optionsOf(second))
    case 'speak':
      return spokenText(asking, first, optionsOf(second))
    case 'rank':
      return rankedTexts(asking, first, second)
    default:
      return calledAsFunction(asking, first)
  }
}
