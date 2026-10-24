import assert from 'node:assert/strict'
import test from 'node:test'
import { model, number, TentError, text } from '../../core/index.ts'
import { ProviderFailure } from '../../core/internal.ts'
import type { FailureKind } from '../../core/internal.ts'
import type { Provider } from '../index.ts'
import { codeOf, layerOf } from './env.ts'

const abilities = ['reply', 'tools', 'typedAnswers', 'embed']

const kinds: readonly string[] = ['unreachable', 'slow', 'server', 'busy', 'refused', 'cutOff', 'notAccepted']
const isKind = (said: string): said is FailureKind => kinds.includes(said)

/** Whether a value is a stream of parts. */
const isStream = (value: unknown): value is AsyncIterable<unknown> =>
  typeof Reflect.get(Object(value), Symbol.asyncIterator) === 'function'

/** Reads a stream to its end, and answers the parts it gave, or what it failed with after them. */
async function readOut(stream: unknown): Promise<{ parts: string[]; error?: unknown }> {
  const parts: string[] = []
  if (!isStream(stream)) return { parts, error: new Error('no stream') }
  try {
    for await (const part of stream) parts.push(String(part))
    return { parts }
  } catch (error) {
    return { parts, error }
  }
}

/** A provider of the test's own: each answer a text, a value, a part and then a failure, or a failure; counted. */
function told(answers: (FailureKind | `text:${string}` | `part:${string}` | 'value' | 'wrong')[]): Provider & {
  asked: number
} {
  let n = 0
  const one: Provider & { asked: number } = {
    asked: 0,
    async *reply() {
      one.asked++
      const answer = answers[Math.min(n++, answers.length - 1)]
      if (answer.startsWith('text:')) {
        yield { end: { text: answer.slice(5), calls: [] } }
        return
      }
      if (answer === 'value' || answer === 'wrong') {
        yield { end: { text: '', calls: [], value: answer === 'value' ? { score: 1 } : { score: 'high' } } }
        return
      }
      if (answer.startsWith('part:')) {
        yield { text: answer.slice(5) }
        throw new ProviderFailure('server', 'cut in the middle')
      }
      throw new ProviderFailure(isKind(answer) ? answer : 'server', `told: ${answer}`)
    },
    async embed() {
      one.asked++
      throw new ProviderFailure('unreachable', 'no vectors today')
    },
  }
  return one
}

/** The model asked, its fall-back, and a third model that only the fall-back names. */
function threeModels(first: Provider, second: Provider, third: Provider, o: { allow?: (m: string) => void } = {}) {
  const last = model('last', { provider: 'third', name: 'l-1', abilities, takes: 1000 })
  const backup = model('backup', { provider: 'second', name: 'b-1', abilities, takes: 1000, fallback: [last] })
  const writer = model('writer', { provider: 'first', name: 'w-1', abilities, takes: 1000, fallback: [backup] })
  return layerOf([writer, backup, last], {
    providers: { first, second, third },
    ...(o.allow ? { allow: ({ model }) => o.allow?.(model) } : {}),
  })
}

test('[26-1] a second provider: a call goes to the next model when the provider cannot be reached, passed its time, answered a server error or was busy', async () => {
  for (const kind of ['unreachable', 'slow', 'server', 'busy'] as const) {
    const layer = threeModels(told([kind]), told(['text:from the backup']), told(['text:never']))
    assert.equal(await layer.call('writer', 'reply', ['Hi.']), 'from the backup', kind)
  }
})

test('[26-1] it never does when the request was not accepted, the model refused, the answer was cut off or did not fit, or a limit of ours was reached', async () => {
  for (const [kind, code] of [
    ['notAccepted', 'T7110'],
    ['refused', 'T7106'],
    ['cutOff', 'T7107'],
  ] as const) {
    const second = told(['text:never'])
    const layer = threeModels(told([kind]), second, told(['text:never']))
    assert.equal(await codeOf(layer.call('writer', 'reply', ['Hi.'])), code, kind)
    assert.equal(second.asked, 0, kind)
  }
  const shape = { score: number() }
  const second = told(['value'])
  const layer = threeModels(told(['wrong']), second, told(['value']))
  assert.equal(await codeOf(layer.call('writer', 'fill', [shape, 'Score it.'])), 'T7108')
  assert.equal(second.asked, 0)
  const limited = told(['text:never'])
  const held = threeModels(told(['text:never']), limited, told(['text:never']), {
    allow: () => {
      throw new TentError('T7102', 'A limit was reached.')
    },
  })
  assert.equal(await codeOf(held.call('writer', 'reply', ['Hi.'])), 'T7102')
  assert.equal(limited.asked, 0)
})

test('[26-1] it never does when part of the answer was already given, nor for embed', async () => {
  const second = told(['text:never'])
  const layer = threeModels(told(['part:Half an']), second, told(['text:never']))
  const read = await readOut(layer.call('writer', 'stream', ['Hi.']))
  assert.deepEqual(read.parts, ['Half an'])
  assert.ok(read.error, 'the stream fails once part of it was given')
  assert.equal(second.asked, 0)
  const vectors = told(['text:never'])
  const embedding = threeModels(told(['text:never']), vectors, told(['text:never']))
  assert.equal(await codeOf(embedding.call('writer', 'embed', ['a text'])), 'T7104')
  assert.equal(vectors.asked, 0)
})

test("[26-1] the fall-back's own fall-back is not followed, and when all fail the error names each", async () => {
  const third = told(['text:from the third'])
  const layer = threeModels(told(['unreachable']), told(['slow']), third)
  const failed = await Promise.resolve(layer.call('writer', 'reply', ['Hi.'])).catch((error: unknown) => error)
  assert.equal(Reflect.get(Object(failed), 'code'), 'T7104')
  assert.match(String(Reflect.get(Object(failed), 'message')), /writer: unreachable.*backup: slow/)
  assert.equal(third.asked, 0)
})

test('[26-1] a fall-back that lacks the ability of the call is passed over', async () => {
  const reader = model('reader', { provider: 'second', name: 'r-1', abilities: ['reply'], takes: 1000 })
  const able = model('able', { provider: 'third', name: 'a-1', abilities, takes: 1000 })
  const writer = model('writer', { provider: 'first', name: 'w-1', abilities, takes: 1000, fallback: [reader, able] })
  const second = told(['value'])
  const layer = layerOf([writer, reader, able], {
    providers: { first: told(['unreachable']), second, third: told(['value']) },
  })
  assert.deepEqual(
    await layer.call('writer', 'fill', [{ score: number(), why: text({ optional: true }) }, 'Score it.']),
    {
      score: 1,
    },
  )
  assert.equal(second.asked, 0)
})
