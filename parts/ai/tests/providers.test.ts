import assert from 'node:assert/strict'
import test from 'node:test'
import { model, number, secret, text } from '../../core/index.ts'
import { layerOf } from './env.ts'
import type { StandIn } from './servers.ts'
import { anthropicEvents, chatEvents, geminiEvents, json, openaiEvents, sse, standIn } from './servers.ts'

// The test reaches each shipped provider on a server of its own on this computer, which answers in the form that
// the provider's own pages give: the four that write, with the calls each has.

const shape = { score: number(), why: text() }
const judged = { score: 0.5, why: 'Half of it.' }
const secrets = { KEY: 'sk-test' }
const wave = new Uint8Array(44 + 16000)
// A WAV header of one second of sound at 16,000 bytes a second.
wave.set([0x52, 0x49, 0x46, 0x46], 0)
wave.set([0x57, 0x41, 0x56, 0x45], 8)
new DataView(wave.buffer).setUint32(28, 16000, true)

/** A stand-in that answers the chat completions, the embeddings, the hearing and the speech of the older format. */
const olderFormat = (t: test.TestContext): Promise<StandIn> =>
  standIn(t, (asked, response) => {
    if (asked.path.endsWith('/chat/completions'))
      return sse(response, chatEvents(asked.json().response_format ? { value: judged } : { text: 'Hello there.' }))
    if (asked.path.endsWith('/embeddings'))
      return json(response, {
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
        usage: { prompt_tokens: 4 },
      })
    if (asked.path.endsWith('/audio/transcriptions')) return json(response, { text: 'Where is my order?' })
    if (asked.path.endsWith('/audio/speech')) {
      response.writeHead(200, { 'content-type': 'audio/mpeg' })
      return response.end(Buffer.from([1, 2, 3]))
    }
    json(response, { error: 'no such path' }, 404)
  })

test('[26-2] anthropic: one reply and one fill against the Messages API, in its form', async (t) => {
  const server = await standIn(t, (asked, response) =>
    sse(response, anthropicEvents(asked.json().tool_choice ? { value: judged } : { text: 'Hello there.' })),
  )
  const writer = model('writer', {
    provider: 'anthropic',
    name: 'claude-sonnet-5-5',
    key: secret('KEY'),
    url: `${server.origin}/v1`,
  })
  const layer = layerOf([writer], { secrets })
  assert.equal(await layer.call('writer', 'reply', ['Say hello.']), 'Hello there.')
  const [reply] = server.asked
  assert.equal(reply.path, '/v1/messages')
  assert.equal(reply.headers['x-api-key'], 'sk-test')
  assert.equal(reply.headers['anthropic-version'], '2023-06-01')
  const body = reply.json()
  assert.equal(body.model, 'claude-sonnet-5-5')
  assert.equal(body.stream, true)
  assert.deepEqual(body.messages, [
    { role: 'user', content: [{ type: 'text', text: 'Say hello.', cache_control: { type: 'ephemeral' } }] },
  ])
  // The server's own count of what was read from a kept start and what was written into one is part of tokensIn.
  assert.deepEqual(layer.used[0].units, { tokensIn: 29, tokensOut: 9, tokensCached: 5, tokensStored: 3, calls: 1 })
  assert.deepEqual(await layer.call('writer', 'fill', [shape, 'Judge it.']), judged)
  const fill = server.asked[1].json()
  assert.deepEqual(fill.tool_choice, { type: 'tool', name: 'answer' })
  assert.equal(Reflect.get(Object(fill.tools)[0], 'name'), 'answer')
})

test('[26-2] openai: one reply, one fill, one embed, one hear and one speak against its newer API, in its form', async (t) => {
  const server = await standIn(t, (asked, response) => {
    if (asked.path === '/v1/responses')
      return sse(
        response,
        openaiEvents(Reflect.get(Object(asked.json().text), 'format') ? { value: judged } : { text: 'Hello there.' }),
      )
    if (asked.path === '/v1/embeddings')
      return json(response, { data: [{ index: 0, embedding: [1, 0] }], usage: { prompt_tokens: 2 } })
    if (asked.path === '/v1/audio/transcriptions')
      return json(response, { text: 'Where is my order?', language: 'english', duration: 1 })
    if (asked.path === '/v1/audio/speech') {
      response.writeHead(200, { 'content-type': 'audio/mpeg' })
      return response.end(Buffer.from([1, 2, 3]))
    }
    json(response, { error: 'no such path' }, 404)
  })
  const url = `${server.origin}/v1`
  const writer = model('writer', { provider: 'openai', name: 'gpt-5', key: secret('KEY'), url })
  const embedder = model('embedder', { provider: 'openai', name: 'text-embedding-3-small', key: secret('KEY'), url })
  const listener = model('listener', { provider: 'openai', name: 'whisper-1', key: secret('KEY'), url })
  const speaker = model('speaker', { provider: 'openai', name: 'gpt-4o-mini-tts', key: secret('KEY'), url })
  const layer = layerOf([writer, embedder, listener, speaker], {
    secrets,
    files: { rec: { name: 'rec.wav', kind: 'audio/wav', bytes: wave } },
  })
  assert.equal(await layer.call('writer', 'reply', ['Say hello.']), 'Hello there.')
  const reply = server.asked[0]
  assert.equal(reply.headers.authorization, 'Bearer sk-test')
  const body = reply.json()
  assert.deepEqual([body.model, body.stream, body.store], ['gpt-5', true, false])
  assert.deepEqual(body.input, [{ role: 'user', content: [{ type: 'input_text', text: 'Say hello.' }] }])
  assert.deepEqual(layer.used[0].units, { tokensIn: 21, tokensOut: 9, tokensCached: 5, calls: 1 })
  assert.deepEqual(await layer.call('writer', 'fill', [shape, 'Judge it.']), judged)
  assert.equal(Reflect.get(Object(Object(server.asked[1].json().text).format), 'type'), 'json_schema')
  assert.deepEqual(await layer.call('embedder', 'embed', ['hello']), [1, 0])
  assert.deepEqual(server.asked[2].json(), { model: 'text-embedding-3-small', input: ['hello'] })
  assert.deepEqual(await layer.call('listener', 'hear', ['rec', { language: 'en' }]), {
    text: 'Where is my order?',
    language: 'english',
    seconds: 1,
  })
  const heard = server.asked[3]
  assert.match(heard.headers['content-type'], /^multipart\/form-data/)
  assert.match(heard.body.toString('latin1'), /name="model"\r\n\r\nwhisper-1/)
  const id = await layer.call('speaker', 'speak', ['Your order has shipped.'])
  assert.equal(typeof id, 'string')
  assert.deepEqual([...(layer.files.get(String(id))?.bytes ?? [])], [1, 2, 3])
  assert.deepEqual(server.asked[4].json(), {
    model: 'gpt-4o-mini-tts',
    input: 'Your order has shipped.',
    voice: 'alloy',
    response_format: 'mp3',
  })
})

test('[26-2] openai-style: one reply, one fill, one embed, one hear and one speak against an open-model server at its url', async (t) => {
  const server = await olderFormat(t)
  const url = `${server.origin}/v1`
  const abilities = ['reply', 'typedAnswers', 'embed', 'hear', 'speak']
  const local = model('local', { provider: 'openai-style', name: 'qwen3', url, abilities, takes: 32000 })
  const layer = layerOf([local], { files: { rec: { name: 'rec.wav', kind: 'audio/wav', bytes: wave } } })
  assert.equal(await layer.call('local', 'reply', ['Say hello.']), 'Hello there.')
  const reply = server.asked[0]
  assert.equal(reply.path, '/v1/chat/completions')
  // A model that states no key sends none.
  assert.equal(reply.headers.authorization, undefined)
  assert.deepEqual(reply.json().messages, [{ role: 'user', content: 'Say hello.' }])
  assert.deepEqual(layer.used[0].units, { tokensIn: 21, tokensOut: 9, tokensCached: 5, calls: 1 })
  assert.deepEqual(await layer.call('local', 'fill', [shape, 'Judge it.']), judged)
  assert.equal(Reflect.get(Object(server.asked[1].json().response_format), 'type'), 'json_schema')
  // The vectors come back in the order of the texts, whatever order the server gave them in.
  assert.deepEqual(await layer.call('local', 'embed', [['a', 'b']]), [
    [1, 0],
    [0, 1],
  ])
  assert.deepEqual(await layer.call('local', 'hear', ['rec']), { text: 'Where is my order?', language: '', seconds: 1 })
  assert.equal(typeof (await layer.call('local', 'speak', ['Hi.', { format: 'mp3' }])), 'string')
})

test('[26-2] google: one reply, one fill and one embed against the API of Gemini, in its form', async (t) => {
  const server = await standIn(t, (asked, response) => {
    if (asked.path.includes(':streamGenerateContent'))
      return sse(
        response,
        geminiEvents(
          Object(asked.json().generationConfig).responseJsonSchema ? { value: judged } : { text: 'Hello there.' },
        ),
      )
    if (asked.path.includes(':batchEmbedContents')) return json(response, { embeddings: [{ values: [1, 0] }] })
    json(response, { error: 'no such path' }, 404)
  })
  const url = `${server.origin}/v1beta`
  const writer = model('writer', { provider: 'google', name: 'gemini-3-pro', key: secret('KEY'), url })
  const embedder = model('embedder', { provider: 'google', name: 'gemini-embedding-001', key: secret('KEY'), url })
  const layer = layerOf([writer, embedder], { secrets })
  assert.equal(await layer.call('writer', 'reply', ['Say hello.']), 'Hello there.')
  const reply = server.asked[0]
  assert.equal(reply.path, '/v1beta/models/gemini-3-pro:streamGenerateContent?alt=sse')
  assert.equal(reply.headers['x-goog-api-key'], 'sk-test')
  assert.deepEqual(reply.json().contents, [{ role: 'user', parts: [{ text: 'Say hello.' }] }])
  assert.deepEqual(layer.used[0].units, { tokensIn: 21, tokensOut: 9, tokensCached: 5, calls: 1 })
  assert.deepEqual(await layer.call('writer', 'fill', [shape, 'Judge it.']), judged)
  assert.equal(Object(server.asked[1].json().generationConfig).responseMimeType, 'application/json')
  assert.deepEqual(await layer.call('embedder', 'embed', ['hello']), [1, 0])
  assert.deepEqual(server.asked[2].json(), {
    requests: [{ model: 'models/gemini-embedding-001', content: { parts: [{ text: 'hello' }] } }],
  })
})
