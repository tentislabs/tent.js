import type { Message } from '../face.ts'
import type { Asking } from './ask.ts'
import { TentError } from '../../core/index.ts'
import { toJsonSchema } from '../../core/internal.ts'
import { valueSoFar } from './growing.ts'
import { misfitOf, typeOfShape, valueOfAnswer, written } from './writing.ts'

/** A queue that one side fills and the other reads as it is filled, until it is ended or fails. */
function queueOf<T>(): { put(value: T): void; end(): void; fail(error: unknown): void; read(): AsyncGenerator<T> } {
  const held: T[] = []
  let done = false
  let failed: { error: unknown } | undefined
  let wake: (() => void) | undefined
  const woken = (): void => {
    wake?.()
    wake = undefined
  }
  return {
    put(value) {
      held.push(value)
      woken()
    },
    end() {
      done = true
      woken()
    },
    fail(error) {
      failed = { error }
      woken()
    },
    async *read() {
      for (;;) {
        while (held.length) {
          const next = held.shift()
          if (next !== undefined) yield next
        }
        if (failed) throw failed.error
        if (done) return
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }
    },
  }
}

/**
 * Takes a model call, its prompt and its options, and what makes its first message. Answers the parts of the text
 * as they arrive, and with a `shape` the parts of the value as it grows. Once a part was given, a failure is not
 * given to a second model: it ends the stream.
 */
export function streamed(
  asking: Asking,
  prompt: unknown,
  options: Record<string, unknown>,
  messageOf: (prompt: unknown, options: Record<string, unknown>) => Promise<Message>,
): AsyncIterable<string | { value: unknown; text: string }> {
  const reasoning =
    typeof options.reasoning === 'function'
      ? (part: string | null): void => void Reflect.apply(Object(options.reasoning), undefined, [part])
      : undefined
  if (options.shape !== undefined) return shaped(asking, prompt, options, messageOf, reasoning)
  const queue = queueOf<string>()
  void (async () => {
    const message = await messageOf(prompt, options)
    await written(
      asking,
      { messages: [message] },
      { text: (part) => queue.put(part), ...(reasoning ? { reasoning } : {}) },
    )
  })().then(
    () => queue.end(),
    (error: unknown) => queue.fail(error),
  )
  return queue.read()
}

/**
 * A stream with a `shape`: parts of `{ value, text }`, each the whole value so far as the text so far reads, and no
 * part but the last checked. The last is the answer, read and checked as `fill` checks one: one that does not fit
 * ends the stream with T7108, after the parts that were given, and goes to no second model.
 */
function shaped(
  asking: Asking,
  prompt: unknown,
  options: Record<string, unknown>,
  messageOf: (prompt: unknown, options: Record<string, unknown>) => Promise<Message>,
  reasoning: ((part: string | null) => void) | undefined,
): AsyncIterable<{ value: unknown; text: string }> {
  const queue = queueOf<{ value: unknown; text: string }>()
  void (async () => {
    const type = typeOfShape(options.shape)
    const message = await messageOf(prompt, options)
    let text = ''
    let last: string | undefined
    const grew = (part: string): void => {
      text += part
      const read = valueSoFar(text)
      if (!read) return
      const seen = JSON.stringify(read.value)
      if (seen === last) return
      last = seen
      queue.put({ value: read.value, text })
    }
    const end = await written(
      asking,
      { messages: [message], shape: toJsonSchema(type) },
      { text: grew, ...(reasoning ? { reasoning } : {}) },
    )
    const value = valueOfAnswer(end)
    const miss = misfitOf(type, value)
    if (miss !== undefined)
      throw new TentError('T7108', `The answer of the model ${end.by} did not fit its shape: ${miss}`, {
        fix: 'Write a shape that the model can fill, or ask a model that keeps to it.',
      })
    queue.put({ value, text: end.text })
  })().then(
    () => queue.end(),
    (error: unknown) => queue.fail(error),
  )
  return queue.read()
}
