import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'
import type { Asked, Said } from './servers.ts'
import { anthropicEvents, chatEvents, geminiEvents, openaiEvents, sse, standIn } from './servers.ts'
import { notDropped } from './started.ts'

// Each shipped provider that writes, and two open-model servers, on a server of the test on this computer that
// answers in the provider's own form: one fill, and one agent that calls three tools in one answer.

const judged = { score: 0.5, why: 'Half of it.' }

/** One provider as the test reaches it: the options of its model, the events of an answer, and where a request is a fill. */
interface Case {
  name: string
  // The options of the model as the source of a project states them, with the address of the server as `URL`.
  options: string
  base: string
  events: (said: Said) => { event?: string; data: unknown }[]
  fill: (body: Record<string, unknown>) => boolean
  // What the ability list says the model cannot do, which fails before anything is sent.
  cannot?: true
}

const cases: Case[] = [
  {
    name: 'anthropic',
    options: "{ provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('KEY'), url: URL }",
    base: '/v1',
    events: anthropicEvents,
    fill: (body) => body.tool_choice !== undefined,
  },
  {
    name: 'openai',
    options: "{ provider: 'openai', name: 'gpt-5', key: secret('KEY'), url: URL }",
    base: '/v1',
    events: openaiEvents,
    fill: (body) => Reflect.get(Object(body.text), 'format') !== undefined,
  },
  {
    name: 'google',
    options: "{ provider: 'google', name: 'gemini-3-pro', key: secret('KEY'), url: URL }",
    base: '/v1beta',
    events: geminiEvents,
    fill: (body) => Reflect.get(Object(body.generationConfig), 'responseJsonSchema') !== undefined,
  },
  {
    name: 'openai-style',
    options:
      "{ provider: 'openai-style', name: 'qwen3', url: URL, abilities: ['reply', 'tools', 'typedAnswers'], takes: 32000 }",
    base: '/v1',
    events: chatEvents,
    fill: (body) => body.response_format !== undefined,
  },
  {
    name: 'a second open-model server',
    options:
      "{ provider: 'openai-style', name: 'llama-4', url: URL, abilities: ['reply', 'tools', 'typedAnswers'], takes: 128000 }",
    base: '/api/v1',
    events: chatEvents,
    fill: (body) => body.response_format !== undefined,
  },
  {
    name: 'an open-model server whose model only replies',
    options: "{ provider: 'openai-style', name: 'tiny', url: URL, abilities: ['reply'], takes: 4000 }",
    base: '/v1',
    events: chatEvents,
    fill: (body) => body.response_format !== undefined,
    cannot: true,
  },
]

/** Whether a request holds the answer of a tool, in any of the forms the providers write it in. */
const answered = (asked: Asked): boolean =>
  /tool_result|function_call_output|"role":"tool"|functionResponse/.test(asked.body.toString('utf8'))

/** The source of the model of the project, with the address of the server. */
const modelsFile = (options: string, url: string): string =>
  `import { model, secret } from 'tentjs'\n\nconst URL = ${JSON.stringify(url)}\nexport const writer = model('writer', ${options})\n`

for (const one of cases)
  test(`[26-8] ${one.name}: one fill and one agent that calls three tools, or the failure that the ability list predicts`, async (t) => {
    let order = ''
    const server = await standIn(t, (asked, response) => {
      if (one.fill(asked.json())) return sse(response, one.events({ value: judged }))
      if (answered(asked)) return sse(response, one.events({ text: 'All done.' }))
      sse(
        response,
        one.events({
          calls: [
            { id: 'c1', tool: 'myOrders', input: {} },
            { id: 'c2', tool: 'markPaid', input: { order } },
            { id: 'c3', tool: 'thank', input: { words: 'you' } },
          ],
        }),
      )
    })
    const folder = copyOf(t, 'shipped')
    writeFileSync(join(folder, 'models.ts'), modelsFile(one.options, `${server.origin}${one.base}`))
    if (one.cannot) {
      // The run is refused at its first model call, before anything is sent: the model cannot use tools.
      const app = await testApp({ folder })
      t.after(() => app.close())
      const maya = await app.user({ name: 'Maya', roles: [] })
      await assert.rejects(Promise.resolve(app.as(maya).call('judgeIt', {})), { code: 'T7001' })
      await assert.rejects(Promise.resolve(app.as(maya).call('helper', { message: 'Pay my order.' })), {
        code: 'T7001',
      })
      assert.equal(server.asked.length, 0)
      return
    }
    const app = await testApp({ folder })
    t.after(() => app.close())
    const maya = await app.user({ name: 'Maya', roles: [] })
    assert.deepEqual(await app.as(maya).call('judgeIt', {}), judged)
    order = String(Reflect.get(Object(await app.as(maya).call('addOrder', { item: 'tent', total: 120 })), 'id'))
    const { run } = notDropped(await app.start('helper', { message: 'Pay my order.' }, { as: maya }))
    assert.deepEqual(await app.runs.wait(run), { text: 'All done.' })
    const steps = (app.runs.read(run)?.steps ?? []).map((step) => `${step.name}:${step.state}`)
    assert.deepEqual(steps, [
      'model 1:done',
      'tool 1.1 myOrders:done',
      'tool 1.2 markPaid:done',
      'tool 1.3 thank:done',
      'model 2:done',
    ])
    assert.deepEqual(
      (await app.rows('orders')).map((row) => row.status),
      ['paid'],
    )
  })
