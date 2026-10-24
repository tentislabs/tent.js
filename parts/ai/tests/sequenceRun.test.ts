import assert from 'node:assert/strict'
import test from 'node:test'
import { answered, handing, lateOrders, lines, rowsOf, sequencedApp, stepsOf, waiting } from './sequencing.ts'
import { notDropped } from './started.ts'

test('[27-18] the sequence of section 8: sequence 1.1 holds its stored form, the orders are read once, each late order is refunded and mailed once in steps tool 1.1.K that keep { tool, input }, one more model step follows, and the model is handed what the sequence returned and none of the rows', async (t) => {
  const { app, maya, orders } = await sequencedApp(t)
  const faked = app.fake('writer', handing(lateOrders))
  const { run } = notDropped(await app.start('helper', { message: 'Refund the late ones.' }, { as: maya }))
  const ask = await waiting(app, run)
  assert.equal(ask?.name, 'ask 1.1.2')
  app.runs.approve(run, 'ask 1.1.2')
  assert.equal(await answered(app, run), 'Done: {"refunded":3}')
  const steps = stepsOf(app, run)
  assert.deepEqual(
    steps.map((one) => one.name),
    [
      'model 1',
      'sequence 1.1',
      'tool 1.1.1 myOrders',
      'ask 1.1.2',
      'tool 1.1.2 refund',
      'tool 1.1.3 mailReceipt',
      'tool 1.1.4 refund',
      'tool 1.1.5 mailReceipt',
      'tool 1.1.6 refund',
      'tool 1.1.7 mailReceipt',
      'model 2',
    ],
  )
  const read = steps.find((one) => one.name === 'sequence 1.1')
  assert.ok(Array.isArray(Reflect.get(Object(read?.result), 'body')), JSON.stringify(read?.result))
  assert.deepEqual(steps.find((one) => one.name === 'tool 1.1.2 refund')?.show, {
    tool: 'refund',
    input: { order: orders[1] },
  })
  assert.equal(await rowsOf(app, maya, 'allRefunds'), 3)
  assert.equal(await rowsOf(app, maya, 'allReceipts'), 3)
  const last = Object(faked.sent.at(-1)?.input)
  assert.doesNotMatch(JSON.stringify(last.messages), /"item":"tent"/, 'no row reaches the model')
})

test('[27-18] calls written without await, as an argument of another call, in the test of an if, and in an each answer their value; a sequence beside another tool of the same answer gives steps whose names do not meet', async (t) => {
  const { app, maya } = await sequencedApp(t)
  const run = lines(
    'const open = myOrders({})',
    'const late = where(myOrders({}), { total: { above: 100 } }).length',
    'const marked = each(where(open, { total: { above: 300 } }), (o) => markLate({ order: o.id }))',
    'if (myOrders({}).length > 3) {',
    '  return { open: open.length, late, marked }',
    '}',
    'return 0',
  )
  app.fake('writer', handing(run, { beside: [{ tool: 'myOrders', with: {} }] }))
  const started = notDropped(await app.start('helper', { message: 'Count.' }, { as: maya }))
  const text = await answered(app, started.run)
  assert.match(text, /^Done: /)
  const names = stepsOf(app, started.run).map((one) => one.name)
  assert.ok(names.includes('tool 1.2 myOrders'), names.join(', '))
  assert.ok(names.includes('tool 1.1.1 myOrders'), names.join(', '))
  assert.equal(new Set(names).size, names.length, 'no two steps meet')
  const sequenceAnswer = Object(app.runs.read(started.run)?.steps.find((one) => one.name === 'model 2'))
  assert.ok(sequenceAnswer)
  assert.equal(await rowsOf(app, maya, 'allLates'), 1)
})

test('[27-18] before anything runs: let, a method of a list, a read of process and now() are T7121 with their line; a field the answer lacks and a missing field are T7121 with the two lines of the tool; a tool the starter may not use is T3101 also in a branch that would not run; and in each case no call was made', async (t) => {
  const { app, maya } = await sequencedApp(t)
  const cases: [string, RegExp][] = [
    [lines('const open = myOrders({})', 'let n = 1'), /^Error T7121: .*`let`.* line 2/s],
    [lines('const open = myOrders({})', 'open.push(1)'), /^Error T7121: .*method.* line 2/s],
    ['return process.env', /^Error T7121: .*`process`.* line 1/s],
    ['return now()', /^Error T7121: .*`now`/s],
    [
      lines('const open = myOrders({})', 'for (const o of open) {', '  markLate({ order: o.colour })', '}'),
      /^Error T7121: .*`colour`.* line 3.*\nmyOrders\(\) -> /s,
    ],
    ['markLate({})', /^Error T7121: .*`order`.*\nmarkLate\(order: id of orders\) -> string\n {2}Marks one order late/s],
    [lines('if (1 > 2) {', '  closeShop({})', '}', 'return 1'), /^Error T3101: .*closeShop/s],
  ]
  for (const [text, refused] of cases) {
    app.fake('writer', handing(text))
    const { run } = notDropped(await app.start('helper', { message: 'Go.' }, { as: maya }))
    const done = await answered(app, run)
    const told = JSON.parse(done.slice('Done: '.length))
    assert.match(String(told), refused, text)
    const steps = stepsOf(app, run)
    assert.ok(!steps.some((one) => one.name.startsWith('tool ')), `${text}: no call was made`)
    const read = Object(steps.find((one) => one.name === 'sequence 1.1')?.result)
    assert.ok(read.refused, JSON.stringify(read))
  }
})

test('[27-18] a call that fails, fail in a sequence, a return past limits.result, and a sequence with no return each hand the model what was done, in the order of the step names', async (t) => {
  const { app, maya } = await sequencedApp(t)
  const toldOf = async (agentName: string, text: string): Promise<string> => {
    app.fake('writer', handing(text))
    const { run } = notDropped(await app.start(agentName, { message: 'Go.' }, { as: maya }))
    return JSON.parse((await answered(app, run)).slice('Done: '.length))
  }
  const failed = await toldOf(
    'helper',
    lines('const open = myOrders({})', 'markLate({ order: open[0].id })', 'broken({ order: open[0].id })', 'return 1'),
  )
  assert.match(String(failed), /^Error T0009: .*line 3/s)
  assert.match(String(failed), /"tool":"myOrders".*"tool":"markLate"/s)
  const own = await toldOf('helper', lines('const open = myOrders({})', "fail('too-late', 'Nothing to do.')"))
  assert.match(String(own), /^Error too-late: Nothing to do\..*line 2/s)
  const large = await toldOf('tight', "return each(range(0, 200), (i) => 'a text of some length')")
  assert.match(String(large), /too large|T5102/)
  const quiet = await toldOf('helper', lines('const open = myOrders({})', 'markLate({ order: open[1].id })'))
  assert.match(JSON.stringify(quiet), /"tool":"myOrders".*"tool":"markLate".*"answer":"late /s)
})

test('[27-18] all runs its calls side by side, answers in the order of the entries, and stops the others when one fails; with goOn the failed entry answers { failed: true, code, message }', async (t) => {
  const { app, maya, orders } = await sequencedApp(t)
  app.fake('writer', handing(lines('const open = myOrders({})', 'return all(open, (o) => markLate({ order: o.id }))')))
  const together = notDropped(await app.start('helper', { message: 'Mark.' }, { as: maya }))
  const answer = await answered(app, together.run)
  assert.equal(answer, `Done: ${JSON.stringify(orders.map((one) => `late ${one}`))}`)
  const names = stepsOf(app, together.run).map((one) => one.name)
  for (const e of [1, 2, 3, 4]) assert.ok(names.includes(`tool 1.1.2.${e}.1 markLate`), names.join(', '))
  app.fake('writer', handing(lines('const open = myOrders({})', 'return all(open, (o) => broken({ order: o.id }))')))
  const failing = notDropped(await app.start('helper', { message: 'Break.' }, { as: maya }))
  assert.match(await answered(app, failing.run), /Error T0009/)
  app.fake(
    'writer',
    handing(lines('const open = myOrders({})', 'return all(open, (o) => broken({ order: o.id }), { goOn: true })')),
  )
  const goingOn = notDropped(await app.start('helper', { message: 'Break on.' }, { as: maya }))
  const gone = JSON.parse((await answered(app, goingOn.run)).slice('Done: '.length))
  assert.equal(gone.length, 4)
  assert.ok(
    gone.every((one: { failed?: boolean; code?: string }) => one.failed === true && one.code === 'T0009'),
    JSON.stringify(gone),
  )
})

test('[27-18] a fill in a sequence is one call with the shape and the prompt alone, in the step fill N.P.K; on a model without typedAnswers it is no name of a sequence; and sequence works together with tell list', async (t) => {
  const { app, maya } = await sequencedApp(t)
  const faked = app.fake('writer', handing("return fill(boolean(), 'Is it late?')", { value: true }))
  const { run } = notDropped(await app.start('helper', { message: 'Judge.' }, { as: maya }))
  assert.equal(await answered(app, run), 'Done: true')
  assert.ok(stepsOf(app, run).some((one) => one.name === 'fill 1.1.1'))
  const fill = faked.sent.map((one) => Object(one.input)).find((one) => one.shape !== undefined)
  assert.equal(fill?.instructions, undefined)
  assert.equal(fill?.tools, undefined)
  assert.deepEqual(
    fill?.messages.map((one: { text?: string }) => one.text),
    ['Is it late?'],
  )
  app.fake('plainWriter', handing("return fill(boolean(), 'Is it late?')"))
  const plain = notDropped(await app.start('listing', { message: 'Judge.' }, { as: maya }))
  assert.match(await answered(app, plain.run), /Error T7121: .*`fill`/s)
  const listing = app.fake('plainWriter', handing(lines('const open = myOrders({})', 'return open.length')))
  const listed = notDropped(await app.start('listing', { message: 'Count.' }, { as: maya }))
  assert.equal(await answered(app, listed.run), 'Done: 4')
  const sentTools = Object(listing.sent[0]?.input).tools.map((one: { name: string }) => one.name)
  assert.deepEqual(sentTools, ['call', 'sequence'])
  assert.ok(stepsOf(app, listed.run).some((one) => one.name === 'tool 1.1.1 myOrders'))
})
