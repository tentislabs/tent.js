import assert from 'node:assert/strict'
import test from 'node:test'
import { errorOf, mcpApp, people } from './mcpApp.ts'

/** The project of the MCP door under `mcp: { anyone: true }`, with toolsListed of one tool and two open queries. */
const openToNobody = [
  { from: 'mcp: { names', to: 'mcp: { anyone: true, toolsListed: 1, names' },
  {
    file: 'functions.ts',
    from: "about: 'A query that is offered to no outside door',\n  access: 'signedIn',",
    to: "about: 'A query that is offered to no outside door',\n  access: anyone('open as well'),\n  offer: ['mcp'],",
  },
]

test('[05-8.26@8a] `{ run }` and `{ run, stop: true }` sent at /mcp to a flow that is offered to MCP, by another caller than its starter: T0001', async (t) => {
  const app = await mcpApp(t)
  const { ada, bob } = await people(app)
  const late = await app.mcp({ as: ada }).call('slowJob', { word: 'late' })
  assert.equal(errorOf(late).code, 'T0008', JSON.stringify(late))
  const run = String(Object(errorOf(late).fields).run)
  const other = app.mcp({ as: bob })
  const waited = await other.call('slowJob', { run })
  assert.equal(errorOf(waited).code, 'T0001', JSON.stringify(waited))
  assert.doesNotMatch(JSON.stringify(waited), /late/)
  const stopped = await other.call('slowJob', { run, stop: true })
  assert.equal(errorOf(stopped).code, 'T0001', JSON.stringify(stopped))
  assert.equal(app.runs.read(run)?.state, 'waiting', 'the run of the other caller goes on')
})

test('[05-13.22] a yes for a tool that asks, sent five times at once: the function runs once', async (t) => {
  const app = await mcpApp(t, [
    { file: 'functions.ts', from: "about: 'Writes a note',", to: "about: 'Writes a note',\n  danger: 'ask'," },
  ])
  const { ada } = await people(app)
  const client = app.mcp({ as: ada, asks: true })
  const asked = await client.call('addNote', { words: 'once' })
  assert.equal(asked.resultType, 'input_required', JSON.stringify(asked))
  const yes = { inputResponses: { ask: { action: 'accept', content: {} } }, requestState: asked.requestState }
  await Promise.all(Array.from({ length: 5 }, () => client.call('addNote', { words: 'once' }, yes)))
  assert.equal((await app.rows('notes')).length, 1)
})

test('[05-13.23] a body that holds a thousand calls is T0002, and none of them runs', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  const calls = Array.from({ length: 1000 }, (_, n) => ({
    jsonrpc: '2.0',
    id: n + 1,
    method: 'tools/call',
    params: { name: 'addNote', arguments: { words: `call ${n}` } },
  }))
  const answered = await app.mcp({ as: ada }).send(calls)
  assert.match(JSON.stringify(answered.body), /T0002/, JSON.stringify(answered.body).slice(0, 300))
  assert.equal(Array.isArray(answered.body), false, 'no answer is given for each call')
  assert.equal((await app.rows('notes')).length, 0)
})

test('[05-13.41] under `mcp: { anyone: true }` a request with no caller that calls a function whose rule is not `anyone` is 401, by its name and through `callFunction`, and nothing runs', async (t) => {
  const app = await mcpApp(t, openToNobody)
  const client = app.mcp()
  const listed = (await client.tools()).map((one) => String(one.name)).sort()
  assert.deepEqual(listed, ['callFunction', 'findFunction'], 'above toolsListed the pair is listed')
  const asked: [string, Record<string, unknown>][] = [
    ['addOrder', { title: 'by nobody' }],
    ['addNote', { words: 'by nobody' }],
    ['sendReceipt', {}],
    ['bigJob', { word: 'nobody' }],
    ['callFunction', { name: 'addOrder', input: { title: 'by nobody' } }],
    ['callFunction', { name: 'addNote', input: { words: 'by nobody' } }],
    ['callFunction', { name: 'bigJob', input: { word: 'nobody' } }],
  ]
  for (const [name, input] of asked) {
    const answered = await client.request('tools/call', { name, arguments: input })
    assert.equal(answered.status, 401, `${name} ${JSON.stringify(input)}: ${JSON.stringify(answered.body)}`)
  }
  assert.equal((await app.rows('orders')).length, 0)
  assert.equal((await app.rows('notes')).length, 0)
  assert.equal(app.runs.find({ flow: 'bigJob' }).length, 0)
  const open = await client.request('tools/call', { name: 'callFunction', arguments: { name: 'openToAll', input: {} } })
  assert.equal(open.status, 200, 'an open function is called through the pair')
})
