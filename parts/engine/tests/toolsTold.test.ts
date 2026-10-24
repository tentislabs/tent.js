import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import { addUser, bundled, running } from './apps.ts'
import { scripted } from './followedApp.ts'
import { untilTried } from './watching.ts'
import { notDropped } from './started.ts'

/** The project of tools as they are told, opened with a model of the test's own and, unless told otherwise, a reader of sequences. */
async function toldApp(t: TestContext, o: { reader?: false } = {}) {
  const model = scripted()
  const run = await running(t, {
    project: 'told',
    engine: {
      makers: { providers: () => ({ mine: model.mine }) },
      ...(o.reader === false ? {} : { readBody: () => ({ body: [] }) }),
    },
  })
  const maya = await addUser(run.app, 'Maya')
  const staff = await addUser(run.app, 'Sam', ['staff'])
  return { ...run, model, maya, staff }
}

/** The tools of a request, by name, with what each is told. */
const toolsOf = (request: ReplyRequest | undefined): Record<string, string> =>
  Object.fromEntries((request?.tools ?? []).map((one) => [one.name, one.about]))

/** The part of a request that comes before the conversation: what a provider keeps of it. */
const startOf = (request: ReplyRequest | undefined): string =>
  JSON.stringify({ instructions: request?.instructions, tools: request?.tools })

test('[27-17] each tool is handed with its sentence and its line, in the order the agent lists them and then sequence; an agent as a tool gives { text: string }; an entry gives its own name and about, line false leaves the line out, and words gives other sentences', async (t) => {
  const h = await toldApp(t)
  const { run } = notDropped(await h.app.start('helper', { message: 'Hi.' }, { as: h.maya }))
  await h.app.runs.wait(run)
  const [first] = h.model.asked
  assert.deepEqual(
    (first?.tools ?? []).map((one) => one.name),
    ['myOrders', 'refund', 'inner', 'staffOrders', 'count', 'refundQuietly', 'sequence'],
  )
  const told = toolsOf(first)
  assert.equal(
    told.myOrders,
    "The orders of the person asking. Gives { id: id of orders, createdAt: date, updatedAt: date, status: 'open' | 'paid', total: number }[]. Reads orders.",
  )
  assert.equal(
    told.refund,
    'Gives a customer their money back for one order. Gives { refund: id of refunds }. Takes order from myOrders, staffOrders. Sends data out. A person is asked before this runs.',
  )
  assert.equal(told.inner, 'Answers from inside. Gives { text: string }.')
  // A tool that is code, states neither reads nor touches and sends nothing names no table, and gives nothing known.
  assert.equal(told.count, 'Counts the orders.')
  assert.equal(
    told.refundQuietly,
    'Gives a customer their money back for one order. A person is asked before this runs.',
  )
  const worded = notDropped(await h.app.start('worded', { message: 'Hi.' }, { as: h.maya }))
  await h.app.runs.wait(worded.run)
  assert.match(toolsOf(h.model.asked.at(-1)).myOrders ?? '', /^The orders of the person asking\. Answers \{ id/)
})

test('[27-17] the start of a request is the same, byte for byte, for two starters and two runs, also where one may not use a tool; in a run that another agent called, a trusted tool carries the sentence of an ask, and two such runs send the same start', async (t) => {
  const h = await toldApp(t)
  for (const as of [h.maya, h.staff, h.maya]) {
    const { run } = notDropped(await h.app.start('helper', { message: 'Hi.' }, { as }))
    await h.app.runs.wait(run)
  }
  const starts = h.model.asked.map(startOf)
  assert.equal(new Set(starts).size, 1, 'one start for every starter and every run')
  // The trusted tool asks nothing where a person started the run, and asks where another agent called it.
  h.model.say((request) =>
    request.instructions === 'You ask another.' && request.messages.at(-1)?.who === 'user'
      ? { calls: [{ tool: 'trusting', input: { message: 'Refund o1.' } }] }
      : { text: 'Done.' },
  )
  const before = h.model.asked.length
  const own = notDropped(await h.app.start('trusting', { message: 'Hi.' }, { as: h.maya }))
  await h.app.runs.wait(own.run)
  assert.equal(toolsOf(h.model.asked.at(-1)).notify, 'Tells the customer. Sends data out.')
  for (let i = 0; i < 2; i++) {
    const { run } = notDropped(await h.app.start('asker', { message: 'Go.' }, { as: h.maya }))
    await h.app.runs.wait(run)
  }
  const called = h.model.asked
    .slice(before)
    .filter((one) => one.instructions === 'You refund.')
    .slice(1)
  assert.equal(called.length, 2)
  assert.equal(toolsOf(called[0]).notify, 'Tells the customer. Sends data out. A person is asked before this runs.')
  assert.equal(startOf(called[0]), startOf(called[1]))
})

test('[27-17] with tell list the model is handed the engine words, the list and the instructions, with call and sequence as its tools; a call by name runs its tool as a step named after it; a name the list does not hold is T0001, and an input that does not fit is T0002 with the two lines of the tool', async (t) => {
  const h = await toldApp(t)
  h.model.say((request) => {
    const answered = request.messages.filter((one) => one.who === 'tool').length
    const names = ['tally', 'nothing', 'refund']
    return answered < names.length
      ? { calls: [{ tool: 'call', input: { name: names[answered], input: answered === 2 ? { order: 7 } : {} } }] }
      : { text: 'Done.' }
  })
  const { run } = notDropped(await h.app.start('lister', { message: 'Count.' }, { as: h.maya }))
  await h.app.runs.wait(run)
  const [first] = h.model.asked
  assert.deepEqual(
    (first?.tools ?? []).map((one) => one.name),
    ['call', 'sequence'],
  )
  const instructions = String(first?.instructions)
  assert.ok(instructions.startsWith('These are the functions you can use.'), instructions)
  assert.ok(instructions.includes('\nmyOrders() -> {'), instructions)
  assert.ok(instructions.includes('\ntally()\n  Counts in code.'), instructions)
  assert.ok(instructions.endsWith('\n\nYou help from a list.'), instructions)
  const steps = h.app.runs.read(run)?.steps.map((one) => one.name) ?? []
  assert.ok(steps.includes('tool 1.1 tally'), steps.join(', '))
  const model1: unknown = h.app.runs.read(run)?.steps.find((one) => one.name === 'model 1')?.result
  assert.match(JSON.stringify(model1), /"tool":"call"/, 'the model step saved the call as call')
  const answers = h.model.asked.flatMap((one) => one.messages).filter((one) => one.who === 'tool')
  assert.ok(
    answers.some((one) => String(one.error) === 'Error T0001: no such tool'),
    JSON.stringify(answers),
  )
  const misfit = answers.find((one) => String(one.error).startsWith('Error T0002'))
  assert.ok(misfit, JSON.stringify(answers))
  assert.match(
    String(misfit?.error),
    /\nrefund\(order: id of orders\) -> \{ refund: id of refunds \}\n {2}Gives a customer/,
  )
})

test('[27-17] with knows the message of the moment stands before the newest message, in no row of memory, for a user, for a person not signed in and for the system; and the start stays the same', async (t) => {
  const h = await toldApp(t)
  for (const as of [h.maya, { kind: 'nobody' as const }, { kind: 'system' as const }]) {
    const chat = String(Reflect.get(Object(await h.app.call('newChat', {}, { as })), 'id'))
    const { run } = notDropped(await h.app.start('knower', { message: 'Hi.', thread: chat }, { as }))
    await h.app.runs.wait(run)
  }
  const knew = h.model.asked.map((one) => String(one.messages.at(-2)?.text ?? ''))
  assert.match(knew[0] ?? '', /^You are talking with the user .+, with no role\.\nThe run started at /)
  assert.match(knew[1] ?? '', /^You are talking with a person who is not signed in\./)
  assert.match(knew[2] ?? '', /^This run was started by the app itself\./)
  const rows = await h.app.read({ from: 'messages' }, { as: 'system' })
  assert.doesNotMatch(JSON.stringify(rows), /You are talking/)
  assert.equal(new Set(h.model.asked.map(startOf)).size, 1)
})

test('[27-17] in a run with sequence, the first answer of more than ten entries is followed by the line that a sequence acts on each, once; and with no reader of source no sequence is offered', async (t) => {
  const h = await toldApp(t)
  for (let n = 1; n <= 12; n++) await h.app.call('addOrder', { total: n }, { as: h.maya })
  h.model.say((request) => {
    const tools = request.messages.filter((one) => one.who === 'tool').length
    return tools < 2 ? { calls: [{ tool: 'myOrders', input: {} }] } : { text: 'Done.' }
  })
  const { run } = notDropped(await h.app.start('helper', { message: 'List.' }, { as: h.maya }))
  await h.app.runs.wait(run)
  const answered = (h.model.asked.at(-1)?.messages ?? [])
    .filter((one) => one.who === 'tool')
    .map((one) => String(one.result))
  assert.equal(answered.length, 2)
  assert.ok(answered[0]?.endsWith('\nTo act on each of these, write one sequence.'), answered[0])
  assert.ok(!answered[1]?.includes('write one sequence'), 'once in a run')
  const bare = await toldApp(t, { reader: false })
  const other = notDropped(await bare.app.start('helper', { message: 'Hi.' }, { as: bare.maya }))
  await bare.app.runs.wait(other.run)
  assert.ok(!(bare.model.asked[0]?.tools ?? []).some((one) => one.name === 'sequence'))
})

test('[27-17] a conversation that holds a call from before its tell was changed is sent with that call as text', async (t) => {
  const h = await toldApp(t)
  h.model.say((request) =>
    request.messages.at(-1)?.who === 'user' && request.messages.length < 3
      ? { calls: [{ tool: 'call', input: { name: 'tally', input: {} } }] }
      : { text: 'Done.' },
  )
  const chat = String(Reflect.get(Object(await h.app.call('newChat', {}, { as: h.maya })), 'id'))
  const first = notDropped(await h.app.start('remembering', { message: 'Count.', thread: chat }, { as: h.maya }))
  await h.app.runs.wait(first.run)
  // The agent is told its tools by the tools of the provider from the next version on.
  const next = await bundled(t, {
    project: 'told',
    change: (description) => Object.assign(Object(description.flows.remembering?.agent), { tell: 'tools' }),
  })
  await h.app.switch(await h.app.add(next.folder))
  const second = notDropped(await h.app.start('remembering', { message: 'Again.', thread: chat }, { as: h.maya }))
  await untilTried('the second run ended', () => ['done', 'failed'].includes(h.app.runs.read(second.run)?.state ?? ''))
  const sent = h.model.asked.at(-1)?.messages ?? []
  assert.ok(!sent.some((one) => (one.calls ?? []).some((call) => call.tool === 'call')), 'no call of call')
  assert.ok(
    sent.some((one) => String(one.text ?? '').includes('call')),
    JSON.stringify(sent),
  )
})
