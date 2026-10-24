import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

// Every file that is loaded from here on, by its address. The hook stands before anything of the parts is
// imported, which is why this file imports them inside its test and not at its top.
const loaded: string[] = []
registerHooks({
  resolve(name, context, next) {
    const found = next(name, context)
    loaded.push(found.url)
    return found
  },
})

test('[27-4] the driver of ai runs with a test env and reaches a tool, _t_memoryRead, _t_memoryAdd, allow, used and tell through it, with no part loaded but core, data, flows and connect', async (t) => {
  const { agent, choice, json, link, model, query, table, text } = await import('../../core/index.ts')
  const { driving } = await import('./driving.ts')

  const writer = model('writer', { provider: 'mine', name: 'm-1', abilities: ['reply', 'tools'], takes: 100_000 })
  const chats = table('chats', { columns: { title: text({ optional: true }) }, access: { read: 'anyone' } })
  const messages = table('messages', {
    columns: {
      chat: link('chats'),
      who: choice(['user', 'assistant', 'tool', 'summary']),
      text: text({ lines: 'many', optional: true }),
      data: json({ optional: true }),
      run: text({ optional: true }),
      by: text({ optional: true }),
    },
    owner: 'by',
    access: { read: 'anyone' },
  })
  const myOrders = query('myOrders', {
    about: 'The orders of the person asking',
    access: 'anyone',
    input: { status: text({ optional: true }) },
    rows: chats.where({}),
  })
  const helper = agent('helper', {
    model: writer,
    instructions: 'You help.',
    tools: [myOrders],
    memory: { in: messages, thread: 'chat' },
    limits: { steps: 4, perRun: { tokensOut: 5000 } },
  })
  const allowed: string[] = []
  const rows: { id: string; who: string; text?: string; data?: unknown }[] = []
  const calls: string[] = []
  const d = driving(t, [writer, chats, messages, myOrders, helper], {
    providers: {
      mine: {
        async *reply(request) {
          // The model asks for the orders first, and answers once their answer is in the conversation.
          const answered = request.messages.some((one) => one.who === 'tool')
          if (!answered) {
            yield { text: 'Let me look.' }
            yield { end: { text: 'Let me look.', calls: [{ id: 'c1', tool: 'myOrders', input: { status: 'open' } }] } }
            return
          }
          yield { text: 'Two are open.' }
          yield { end: { text: 'Two are open.', calls: [], units: { tokensIn: 20, tokensOut: 4 } } }
        },
      },
    },
    allow: (asked) => void allowed.push(asked.model),
    calls: {
      myOrders: (input) => {
        calls.push(`myOrders ${JSON.stringify(input)}`)
        return [{ id: 'o1' }, { id: 'o2' }]
      },
      _t_memoryRead: (input) => {
        calls.push(`_t_memoryRead ${JSON.stringify(input)}`)
        return { rows: rows.map((one) => ({ ...one })) }
      },
      _t_memoryAdd: (input) => {
        const added: unknown = Reflect.get(Object(input), 'rows')
        calls.push(
          `_t_memoryAdd ${JSON.stringify(Array.isArray(added) ? added.map((one) => Reflect.get(Object(one), 'who')) : [])}`,
        )
        const ids: string[] = []
        for (const one of Array.isArray(added) ? added : []) {
          const id = `r${rows.length + 1}`
          rows.push({ id, ...Object(one) })
          ids.push(id)
        }
        return { rows: ids }
      },
    },
  })
  const { ran, used, told } = d
  const { run, answer, steps } = await ran('helper', { message: 'Which orders are open?', thread: 'c-1' })
  assert.deepEqual(answer, { text: 'Two are open.' })
  assert.deepEqual(steps, [
    'remember:done',
    'model 1:done',
    'tool 1.1 myOrders:done',
    'remember 1:done',
    'model 2:done',
    'remember 2:done',
  ])
  // The tool, the reading and the adding of memory are reached through `call` of the env.
  assert.deepEqual(calls, [
    '_t_memoryAdd ["user"]',
    '_t_memoryRead {"agent":"helper","thread":"c-1"}',
    'myOrders {"status":"open"}',
    '_t_memoryAdd ["assistant","tool"]',
    '_t_memoryRead {"agent":"helper","thread":"c-1"}',
    '_t_memoryAdd ["assistant"]',
  ])
  // The limits are asked before each call to the model, and each call is told to `used`.
  assert.deepEqual(allowed, ['writer', 'writer'])
  assert.deepEqual(
    used.map((one) => [one.name, one.answeredBy, one.ok, one.run]),
    [
      ['writer', 'writer', true, run],
      ['writer', 'writer', true, run],
    ],
  )
  // The text of a model step is told to whoever watches the run, as it is written.
  assert.deepEqual(told, [
    { run, kind: 'text', step: 'model 1', text: 'Let me look.' },
    { run, kind: 'text', step: 'model 2', text: 'Two are open.' },
  ])
  // Nothing was loaded but the four parts and `ai`: no engine, no build, no screens.
  const parts = new Set(
    loaded
      .filter((address) => !address.includes('/tests/'))
      .map((address) => /\/parts\/([^/]+)\//.exec(address)?.[1])
      .filter((one) => one !== undefined),
  )
  assert.deepEqual([...parts].sort(), ['ai', 'connect', 'core', 'data', 'flows'])
})
