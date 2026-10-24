import assert from 'node:assert/strict'
import test from 'node:test'
import { model, number } from '../../core/index.ts'
import { ProviderFailure } from '../../core/internal.ts'
import type { FailureKind } from '../../core/internal.ts'
import type { Provider, ReplyRequest } from '../index.ts'
import { written } from '../layer/writing.ts'
import { codeOf, layerOf } from './env.ts'

const abilities = ['reply', 'tools']

const kinds: readonly string[] = ['unreachable', 'slow', 'server', 'busy', 'refused', 'cutOff', 'notAccepted']
const isKind = (said: string): said is FailureKind => kinds.includes(said)

/** A provider of a test's own that answers a text, or fails as it is told, and keeps what it was handed. */
function told(
  answers: (FailureKind | string)[],
  o: { retryAfter?: number } = {},
): Provider & { asked: ReplyRequest[] } {
  const asked: ReplyRequest[] = []
  let n = 0
  return {
    asked,
    async *reply(request) {
      asked.push(request)
      const answer = answers[Math.min(n++, answers.length - 1)]
      if (answer.startsWith('text:')) {
        yield { text: answer.slice(5) }
        yield { end: { text: answer.slice(5), calls: [] } }
        return
      }
      if (!isKind(answer)) throw new Error('Something of its own went wrong.')
      throw new ProviderFailure(answer, `told: ${answer}`, o)
    },
  }
}

/** A model asked, with one fall-back, each of a provider of the test's own. */
function twoModels(first: Provider, second: Provider): ReturnType<typeof layerOf> {
  const backup = model('backup', { provider: 'second', name: 'b-1', abilities, takes: 1000 })
  const writer = model('writer', { provider: 'first', name: 'w-1', abilities, takes: 1000, fallback: [backup] })
  return layerOf([writer, backup], { providers: { first, second } })
}

test('[26-3] [16-2@9a] each kind of ProviderFailure leads to the row of the table it belongs to', async () => {
  // Goes to the next model, with no second try of the same one.
  for (const kind of ['unreachable', 'slow'] as const) {
    const first = told([kind])
    const layer = twoModels(first, told(['text:from the backup']))
    assert.equal(await layer.call('writer', 'reply', ['Hi.']), 'from the backup', kind)
    assert.deepEqual(
      layer.used.map((one) => [one.answeredBy, one.ok, one.code ?? '']),
      [
        ['writer', false, kind],
        ['backup', true, ''],
      ],
    )
    assert.equal(layer.used[1].reason, kind)
  }
  // Tried once more, then the next model. What a provider throws that is no ProviderFailure counts as `server`.
  for (const kind of ['busy', 'server', 'thrown'] as const) {
    const first = told([kind])
    const layer = twoModels(first, told(['text:from the backup']))
    assert.equal(await layer.call('writer', 'reply', ['Hi.']), 'from the backup', kind)
    assert.equal(first.asked.length, 2, kind)
    assert.deepEqual(
      layer.used.map((one) => one.answeredBy),
      ['writer', 'writer', 'backup'],
    )
  }
  // A second try of the same model that works is the answer.
  {
    const layer = twoModels(told(['busy', 'text:at the second try']), told(['text:never']))
    assert.equal(await layer.call('writer', 'reply', ['Hi.']), 'at the second try')
  }
  // A wait that the server asks for is waited on the engine's clock, and one longer than `tries.wait` is not.
  {
    const layer = twoModels(told(['busy', 'text:after the wait'], { retryAfter: 2000 }), told(['text:never']))
    assert.equal(await layer.call('writer', 'reply', ['Hi.']), 'after the wait')
    assert.deepEqual(layer.slept, [2000])
    const long = twoModels(told(['busy', 'text:never'], { retryAfter: 60_000 }), told(['text:from the backup']))
    assert.equal(await long.call('writer', 'reply', ['Hi.']), 'from the backup')
    assert.deepEqual(long.slept, [])
  }
  // Fails with its code, and goes to no second model.
  for (const [kind, code] of [
    ['notAccepted', 'T7110'],
    ['refused', 'T7106'],
    ['cutOff', 'T7107'],
  ] as const) {
    const second = told(['text:never'])
    const layer = twoModels(told([kind]), second)
    assert.equal(await codeOf(layer.call('writer', 'reply', ['Hi.'])), code, kind)
    assert.equal(second.asked.length, 0, kind)
  }
  // When every model failed, the error names each, with its reason.
  {
    const layer = twoModels(told(['unreachable']), told(['notAccepted', 'server']))
    const failed = await Promise.resolve(layer.call('writer', 'reply', ['Hi.'])).catch((error: unknown) => error)
    assert.equal(Reflect.get(Object(failed), 'code'), 'T7110')
    const all = twoModels(told(['unreachable']), told(['slow']))
    const both = await Promise.resolve(all.call('writer', 'reply', ['Hi.'])).catch((error: unknown) => error)
    assert.equal(Reflect.get(Object(both), 'code'), 'T7104')
    assert.match(String(Reflect.get(Object(both), 'message')), /writer: unreachable.*backup: slow/)
  }
})

test('[26-3] a tool named with a dot reaches the provider under a name it takes, and its call comes back under its own', async () => {
  const asked: ReplyRequest[] = []
  const provider: Provider = {
    async *reply(request) {
      asked.push(request)
      const handed = request.tools?.[0]?.name ?? ''
      yield { end: { text: '', calls: [{ id: 'c1', tool: handed, input: {} }] } }
    },
  }
  const writer = model('writer', { provider: 'mine', name: 'w-1', abilities, takes: 1000 })
  const layer = layerOf([writer], { providers: { mine: provider } })
  const tools = [{ name: 'taskBoard.listBoards', about: 'Lists the boards.', input: { type: 'object' } }]
  const end = await written(
    {
      env: layer.env,
      model: 'writer',
      method: 'reply',
      caller: { kind: 'system' },
      version: 'v1',
      signal: new AbortController().signal,
    },
    {
      messages: [
        { who: 'user', text: 'Which boards?' },
        { who: 'assistant', calls: [{ id: 'c0', tool: 'taskBoard.listBoards', input: {} }] },
        { who: 'tool', id: 'c0', result: [] },
      ],
      tools,
    },
  )
  const handed = asked[0].tools?.[0]?.name ?? ''
  assert.match(handed, /^[A-Za-z0-9_-]{1,64}$/)
  assert.notEqual(handed, 'taskBoard.listBoards')
  // A call of the conversation so far is handed under the same name.
  assert.equal(asked[0].messages[1].calls?.[0]?.tool, handed)
  assert.deepEqual(end.calls, [{ id: 'c1', tool: 'taskBoard.listBoards', input: {} }])
})

test('[26-3] [16-2@9a] a provider that has size is asked for the count of a request, and one over takes by that count is refused', async () => {
  const counted: number[] = []
  let replies = 0
  const provider = (size: number): Provider => ({
    size() {
      counted.push(size)
      return size
    },
    async *reply() {
      replies++
      yield { end: { text: 'ok', calls: [] } }
    },
  })
  const small = model('small', { provider: 'counts', name: 's-1', abilities, takes: 100 })
  const fits = layerOf([small], { providers: { counts: provider(100) } })
  assert.equal(await fits.call('small', 'reply', ['A short text.']), 'ok')
  const over = layerOf([small], { providers: { counts: provider(101) } })
  assert.equal(await codeOf(over.call('small', 'reply', ['A short text.'])), 'T7109')
  assert.deepEqual([counted, replies], [[100, 101], 1])
  // Without size the rule counts: a text of 3,000 bytes is a thousand tokens, over a model that takes 100.
  const bare: Provider = { reply: provider(0).reply }
  const ruled = layerOf([small], { providers: { counts: bare } })
  assert.equal(await codeOf(ruled.call('small', 'reply', ['x'.repeat(3000)])), 'T7109')
})

test('[16-2@9a] T7001: a model is asked for an ability it does not have', async () => {
  const replies: Provider = {
    async *reply() {
      yield { end: { text: 'ok', calls: [] } }
    },
  }
  const plain = model('plain', { provider: 'mine', name: 'p-1', abilities: ['reply'], takes: 1000 })
  const layer = layerOf([plain], { providers: { mine: replies } })
  assert.equal(await codeOf(layer.call('plain', 'fill', [{ n: number() }, 'Count.'])), 'T7001')
  assert.equal(await codeOf(layer.call('plain', 'embed', ['a text'])), 'T7001')
  assert.equal(await codeOf(layer.call('plain', 'reply', ['Look.', { images: ['f1'] }])), 'T7001')
  assert.equal(await codeOf(layer.call('plain', 'call', [{}])), 'T7001')
  // A model that has the ability, but whose provider has no member for it, cannot do it either.
  const said = model('said', { provider: 'mine', name: 's-1', abilities: ['reply', 'speak'], takes: 1000 })
  const lacking = layerOf([said], { providers: { mine: replies } })
  assert.equal(await codeOf(lacking.call('said', 'speak', ['Hi.'])), 'T7001')
  assert.deepEqual(layer.used, [])
})
