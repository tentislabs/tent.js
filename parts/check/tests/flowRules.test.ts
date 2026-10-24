import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Finding } from '../../core/index.ts'
import type { Facts } from '../../core/internal.ts'
import { checkProject } from '../index.ts'
import { checkRules } from '../ours.ts'
import { list } from '../rules/list.ts'
import { copyOf, heldToProjects, lineWith } from './copies.ts'

// The rules of the flows, each by the name of its file in the list. T5003 is held apart: it reads the facts of a
// running app, and finds nothing where none are handed in.
const alone = ['T5001', 'T5002', 'T3004/flows', 'T7009/flows', 'T5007/kinds', 'T5007/definitions']
const file = 'flows/orders.ts'

/** A project of a rule, copied, with what the rules of our own find in it. */
async function checked(name: string, side: 'pass' | 'fail', facts?: Facts) {
  const folder = copyOf(join(name, side), `${name.replace('/', '-')}-${side}`)
  const { findings } = await checkRules(folder, facts ? { facts } : {})
  const text = readFileSync(join(folder, file), 'utf8')
  /** The findings as the line each stands at, by the piece of code that the line holds. */
  const at = (piece: string): Finding[] => findings.filter((one) => one.where?.line === lineWith(text, piece))
  return { folder, findings, at }
}

/** Holds each finding to its place, its sentence, its fix and its page. */
function whole(findings: Finding[], level = 'error'): void {
  for (const one of findings) {
    // A finding of a kind of worker stands at the project, and every other at its definition.
    assert.ok([file, 'tent.ts'].includes(String(one.where?.file)), one.code)
    assert.ok((one.where?.line ?? 0) > 0, one.code)
    assert.ok(one.message.length > 10 && one.fix, one.code)
    assert.equal(one.docs, `tent docs ${one.code}`)
    assert.equal(one.level, level, one.code)
  }
}

test('[15-1@7b] every rule of the flows has a passing project and a failing project, and the failing one gives exactly its code', async () => {
  const names = list.map((one) => one.name)
  for (const name of [...alone, 'T5003']) assert.ok(names.includes(name), `the rule ${name} is built`)
  for (const name of alone) whole((await heldToProjects(name)).findings)
})

test('[23-5] [15-1@7b] a call to a change outside a step is reported by the check, and so is each other work there and each word that is drawn, at its line, with the fix', async () => {
  const { findings, at } = await checked('T5001', 'fail')
  const pieces = {
    'addOrder({ title: input.title })': /calls the change `addOrder`/,
    'await other()': /calls the flow `other`/,
    'start(other)': /starts a run with `start`/,
    'await mail.send': /uses `mail\.send`, which does more than read/,
    'const at = now()': /draws a value, `now\(\)`/,
    'const pick = random()': /draws a value, `random\(\)`/,
    'const code = token()': /draws a value, `token\(\)`/,
  }
  for (const [piece, sentence] of Object.entries(pieces)) {
    const [one, ...more] = at(piece)
    assert.ok(one && more.length === 0, `one finding at \`${piece}\``)
    assert.equal(one.code, 'T5001')
    assert.match(one.message, sentence)
    assert.match(one.message, /outside a step/)
    assert.match(String(one.fix), /await step\('a name', \(\) => \.\.\.\)/)
    assert.equal(one.where?.definition, 'careless')
  }
  // Nothing else of the file is found: the step that ends the flow, and the flow that only holds a step.
  assert.equal(findings.length, Object.keys(pieces).length)
  // The same work inside a step, a query, a read through `db`, a member of a handle that only reads, `log`, a
  // word that works on what it is handed, and `step.now()` between two steps are all as the documents ask.
  assert.deepEqual((await checked('T5001', 'pass')).findings, [])
})

test('[23-6] [15-1@7b] a step that is not awaited is reported by the check, at its line, and one whose promise is kept, answered or handed on is not', async () => {
  const { findings, at } = await checked('T5002', 'fail')
  for (const [piece, tool] of [
    ["step('add'", 'step'],
    ["step.wait('1 day')", 'step.wait'],
  ]) {
    const [one, ...more] = at(piece)
    assert.ok(one && more.length === 0, `one finding at \`${piece}\``)
    assert.equal(one.code, 'T5002')
    assert.ok(one.message.includes(`\`${tool}\` is not awaited`), one.message)
    assert.match(String(one.fix), /await/)
    assert.equal(one.where?.definition, 'hasty')
  }
  assert.equal(findings.length, 2)
  assert.deepEqual((await checked('T5002', 'pass')).findings, [])
})

test('[15-1@7b] T5003: a step name that runs which have not ended depend on, and that is gone or renamed, is reported from the facts of the running app, as a warning at the flow', async () => {
  // What the running app says: runs of `bigOrder` that have not ended saved `tell sales` and wait at `approval`.
  const facts: Facts = { tableFindings: [], waitingStepNames: { bigOrder: ['tell sales', 'approval'] } }
  for (const side of ['pass', 'fail'] as const)
    assert.deepEqual((await checked('T5003', side)).findings, [], `the ${side}ing project, with no facts`)
  assert.deepEqual((await checked('T5003', 'pass', facts)).findings, [])
  const { findings, at } = await checked('T5003', 'fail', facts)
  assert.equal(findings.length, 1)
  const [one] = at("flow('bigOrder'")
  assert.ok(one, 'the finding stands at the flow')
  assert.deepEqual([one.code, one.where?.definition], ['T5003', 'bigOrder'])
  assert.match(one.message, /`tell sales`, which is gone or renamed/)
  whole(findings, 'warning')

  // Steps that the step tools name themselves, and the steps of a flow's own `onFail`, are no step of `run`.
  const own: Facts = { tableFindings: [], waitingStepNames: { bigOrder: ['tell sales', 'wait', 'onFail.tidy'] } }
  assert.deepEqual((await checked('T5003', 'pass', own)).findings, [])
  // Runs of a flow that the project no longer holds are told at the project.
  const gone: Facts = { tableFindings: [], waitingStepNames: { oldFlow: ['first'] } }
  const told = (await checked('T5003', 'pass', gone)).findings
  assert.deepEqual(
    told.map((found) => [found.code, found.level, found.where?.file, found.where?.definition]),
    [['T5003', 'warning', 'tent.ts', 'shop']],
  )
  assert.match(told[0].message, /oldFlow/)
})

test('[23-18] [15-1@7b] a flow that does not run as its starter, called and waited for from an action that states no `system`, is T3004 for the check, and the same call from an action that states `system`, and `start`, are not', async () => {
  const { at } = await checked('T3004/flows', 'fail')
  const [one, ...more] = at('await tidy()')
  assert.ok(one && more.length === 0)
  assert.deepEqual([one.code, one.where?.definition], ['T3004', 'tidyNow'])
  assert.match(one.message, /calls the flow `tidy` and waits for it/)
  assert.match(String(one.fix), /system: 'why'/)
  // The passing project holds the same call under `system`, a `start`, and a call of a flow that runs as its starter.
  assert.deepEqual((await checked('T3004/flows', 'pass')).findings, [])
})

test("[23-30] [15-1@7b] an offered flow that neither states `as: 'starter'` nor `system` is T3004, and one with no `input` is T7009, each at its flow", async () => {
  const full = await checked('T3004/flows', 'fail')
  const [open, ...more] = full.at("flow('welcome'")
  assert.ok(open && more.length === 0)
  assert.deepEqual([open.code, open.where?.definition], ['T3004', 'welcome'])
  assert.match(open.message, /is offered, and has full access with no reason stated/)
  assert.match(String(open.fix), /as: 'starter'/)
  // The flow that nothing offers has full access and is not found.
  assert.equal(full.findings.length, 2)

  const told = await checked('T7009/flows', 'fail')
  const [bare] = told.at("flow('welcome'")
  assert.deepEqual([bare?.code, bare?.where?.definition], ['T7009', 'welcome'])
  assert.match(bare.message, /offered to the pages of the app, and states no `input`\./)
  // One that is offered to an outside door says what a caller there must know of it.
  const [door] = told.at("flow('report'")
  assert.deepEqual([door?.code, door?.where?.definition], ['T7009', 'report'])
  assert.match(door.message, /offered to an outside door, and states no `about`, no `output`\./)
  // And one that an agent uses as a tool says what a model must know of it.
  const [tool] = told.at("flow('tidy'")
  assert.deepEqual([tool?.code, tool?.where?.definition], ['T7009', 'tidy'])
  assert.match(tool.message, /is a tool of an agent, and states no `about`, no `input`, no `output`\./)
  assert.equal(told.findings.length, 3)
  whole(told.findings)
})

test('[23-14] a value of the wrong type handed to a call inside a step, and a read of a field that the answer of an earlier step does not have, are each reported by `tent check`, from the type checker', async () => {
  const folder = copyOf('flowTyped', 'flowTyped')
  const text = readFileSync(join(folder, file), 'utf8')
  const { findings } = await checkProject(folder)
  const typed = findings.filter((one) => one.code === 'T8000')
  for (const piece of ['addOrder({ title: 5 })', 'saved.nothere']) {
    const line = lineWith(text, piece)
    assert.ok(line > 0, piece)
    assert.equal(typed.filter((one) => one.where?.file === file && one.where.line === line).length, 1, piece)
  }
  // The same file holds a call with the right type and a read of a field that the step answers: neither is found.
  assert.equal(typed.length, 2, JSON.stringify(typed.map((one) => [one.where?.line, one.message])))
})

test('[51-2] [15-1@7b] the check reports as T5007 a worker of no kind, a worker beside background, a next that runs in a ring or names no cause or wait beside orHere, and system work or code with no uses on a kind that states systemWork false', async () => {
  const { findings } = await checked('T5007/kinds', 'fail')
  const told = findings.map((one) => one.message)
  for (const piece of [/tpu/, /beside /, /runs in a ring/, /names no cause/, /orHere/, /runs as the system/])
    assert.ok(
      told.some((one) => piece.test(one)),
      String(piece),
    )
  assert.equal(findings.filter((one) => /tpu/.test(one.message)).length, 2, 'on an action and on a step')
})

test('[51-2] [15-1@7b] the check notes as T5008 an action that states background and not sends false', async () => {
  const failing = await checked('T5008', 'fail')
  assert.deepEqual(
    failing.findings.map((one) => [one.code, one.level, one.where?.definition]),
    [['T5008', 'note', 'encode']],
  )
  assert.deepEqual((await checked('T5008', 'pass')).findings, [])
})

test('[51-2] [15-1@7b] T5007 finds a kind of worker that a step names through a variable', async () => {
  const { findings } = await checked('T5007/kinds', 'fail')
  assert.equal(findings.filter((one) => /"quantum"/.test(one.message)).length, 1)
})

test('[15-1@7b] T5007: a batch whose code takes no list or answers none, a reserve past a limit of use that holds it, and an action that states changes false and starts a run or emits', async () => {
  const { findings } = await checked('T5007/definitions', 'fail')
  const told = findings.map((one) => `${one.where?.definition} ${one.message}`)
  for (const piece of [
    /batchOfOne .*takes no list/,
    /batchOfOne .*answers no list/,
    /reserved .*reserve/,
    /quietStarts .*starts a run/,
    /quietEmits .*emits/,
  ])
    assert.ok(
      told.some((one) => piece.test(one)),
      `${piece}: ${JSON.stringify(told)}`,
    )
})
