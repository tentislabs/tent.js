import assert from 'node:assert/strict'
import test from 'node:test'
import { boolean, list, model, number, text } from '../../core/index.ts'
import { ProviderFailure } from '../../core/internal.ts'
import type { Provider, ReplyPart, ReplyRequest } from '../index.ts'
import { codeOf, layerOf } from './env.ts'

const abilities = ['reply', 'tools', 'typedAnswers']

/** A provider that writes the parts it is given, and then ends as it is told: with its text, a value, or a failure. */
function parted(
  parts: string[],
  end: { value?: unknown; fail?: 'cutOff' | 'server'; reasoning?: string[]; keep?: unknown } = {},
): Provider & { asked: ReplyRequest[] } {
  const asked: ReplyRequest[] = []
  return {
    asked,
    async *reply(request): AsyncGenerator<ReplyPart> {
      asked.push(request)
      for (const one of end.reasoning ?? []) yield { reasoning: one }
      for (const one of parts) yield { text: one }
      if (end.fail) throw new ProviderFailure(end.fail, `told: ${end.fail}`)
      const whole = parts.join('')
      yield {
        end: {
          text: whole,
          calls: [],
          ...(end.value === undefined ? {} : { value: end.value }),
          ...(end.keep === undefined ? {} : { keep: end.keep }),
        },
      }
    },
  }
}

const shape = { title: text(), tags: list(text()), score: number(), done: boolean() }

/** The model asked, with a fall-back that would answer, each of a provider of the test. */
function asked(first: Provider): ReturnType<typeof layerOf> {
  const backup = model('backup', { provider: 'second', name: 'b-1', abilities, takes: 1000 })
  const writer = model('writer', { provider: 'first', name: 'w-1', abilities, takes: 1000, fallback: [backup] })
  return layerOf([writer, backup], {
    providers: { first, second: parted(['{"title":"x","tags":[],"score":1,"done":false}']) },
  })
}

/** Every part of a stream, until it ends, and the code it ended with, or `ok`. */
async function partsOf(stream: unknown): Promise<{ parts: unknown[]; ended: string }> {
  const parts: unknown[] = []
  try {
    for await (const part of Object(stream)) parts.push(part)
    return { parts, ended: 'ok' }
  } catch (error) {
    return { parts, ended: String(Reflect.get(Object(error), 'code')) }
  }
}

test('[26-10] stream with a shape gives parts of { value, text } that grow, each the whole value so far, by each row of the table, and the last is the checked answer', async () => {
  const written = [
    'Here it is: ```json\n',
    '{"title": "A te',
    'nt\\',
    'n", "tags": ["a", "b',
    '"], "score": 1',
    '2, "don',
    'e": tr',
    'ue}',
    '\n```',
  ]
  const layer = asked(parted(written))
  const { parts, ended } = await partsOf(layer.call('writer', 'stream', ['Describe it.', { shape }]))
  assert.equal(ended, 'ok')
  const values = parts.map((one) => Reflect.get(Object(one), 'value'))
  // A part is given where the value so far changed, and the last is the answer, checked as `fill` checks one.
  assert.deepEqual(values, [
    // Nothing before the first `{`; an open object closed where it stands, and a text as far as it has come.
    { title: 'A te' },
    // An escape that is cut in half is not given.
    { title: 'A tent' },
    // A number that may not be whole is left out until what follows it has come.
    { title: 'A tent\n', tags: ['a', 'b'] },
    // A key whose value has not begun is left out, as is a word that is not whole.
    { title: 'A tent\n', tags: ['a', 'b'], score: 12 },
    { title: 'A tent\n', tags: ['a', 'b'], score: 12, done: true },
    { title: 'A tent\n', tags: ['a', 'b'], score: 12, done: true },
  ])
  // Beside each value stands the text so far, as the model wrote it.
  assert.equal(Reflect.get(Object(parts.at(-1)), 'text'), written.join(''))
  assert.ok(String(Reflect.get(Object(parts[0]), 'text')).endsWith('"A te'))
})

test('[26-10] an answer that does not fit ends the stream with T7108, and one that was cut off with T7107, each after its parts, and neither goes to a second model', async () => {
  const misfit = asked(parted(['{"title": "A tent", ', '"score": "many"}']))
  const one = await partsOf(misfit.call('writer', 'stream', ['Describe it.', { shape }]))
  assert.equal(one.ended, 'T7108')
  assert.ok(one.parts.length >= 1)
  assert.deepEqual(
    misfit.used.map((used) => used.answeredBy),
    ['writer'],
  )
  const cut = asked(parted(['{"title": "A te'], { fail: 'cutOff' }))
  const two = await partsOf(cut.call('writer', 'stream', ['Describe it.', { shape }]))
  assert.equal(two.ended, 'T7107')
  assert.deepEqual(
    two.parts.map((part) => Reflect.get(Object(part), 'value')),
    [{ title: 'A te' }],
  )
  assert.deepEqual(
    cut.used.map((used) => used.answeredBy),
    ['writer'],
  )
})

test('[26-10] a provider that reads the value itself and sends no text gives one part, at the end', async () => {
  const value = { title: 'A tent', tags: [], score: 3, done: false }
  const layer = asked(parted([], { value }))
  const { parts, ended } = await partsOf(layer.call('writer', 'stream', ['Describe it.', { shape }]))
  assert.equal(ended, 'ok')
  assert.deepEqual(parts, [{ value, text: '' }])
})

test("[26-10] a provider's reasoning reaches reasoning of the call as it arrives, and with none stated nothing is given on", async () => {
  const layer = asked(parted(['The answer.'], { reasoning: ['First I look', ' at the order.'] }))
  const heard: (string | null)[] = []
  assert.equal(
    await layer.call('writer', 'reply', ['Hi.', { reasoning: (part: string | null) => heard.push(part) }]),
    'The answer.',
  )
  assert.deepEqual(heard, ['First I look', ' at the order.'])
  // A typed answer and a stream hand them on too.
  const filled: (string | null)[] = []
  const typed = asked(parted(['{"title":"t","tags":[],"score":1,"done":true}'], { reasoning: ['Thinking.'] }))
  await typed.call('writer', 'fill', [shape, 'Describe it.', { reasoning: (part: string | null) => filled.push(part) }])
  assert.deepEqual(filled, ['Thinking.'])
  const silent = asked(parted(['The answer.'], { reasoning: ['Unheard.'] }))
  assert.equal(await silent.call('writer', 'reply', ['Hi.']), 'The answer.')
})

test('[26-10] a call that fails after reasoning alone goes to the next model, and reasoning is told null first; what a provider keeps is handed back and never given to reasoning', async () => {
  const heard: (string | null)[] = []
  const first: Provider = {
    async *reply(): AsyncGenerator<ReplyPart> {
      yield { reasoning: 'A thought of the first.' }
      throw new ProviderFailure('unreachable', 'gone')
    },
  }
  const layer = asked(first)
  assert.equal(
    await codeOf(layer.call('writer', 'reply', ['Hi.', { reasoning: (part: string | null) => heard.push(part) }])),
    'ok',
  )
  assert.deepEqual(heard, ['A thought of the first.', null])
  assert.deepEqual(
    layer.used.map((used) => used.answeredBy),
    ['writer', 'backup'],
  )
  // What is kept travels back to the model with the next request of the run, and never to the reasoning.
  const keeping = parted(['Done.'], { keep: { thought: 'hidden' }, reasoning: ['Shown.'] })
  const kept = layerOf([model('writer', { provider: 'first', name: 'w-1', abilities, takes: 1000 })], {
    providers: { first: keeping },
  })
  const reasoning: (string | null)[] = []
  await kept.call('writer', 'reply', ['Hi.', { reasoning: (part: string | null) => reasoning.push(part) }])
  assert.deepEqual(reasoning, ['Shown.'])
  assert.equal(JSON.stringify(reasoning).includes('hidden'), false)
})
