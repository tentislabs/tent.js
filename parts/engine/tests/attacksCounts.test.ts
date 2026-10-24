import assert from 'node:assert/strict'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { App, Provider, ReplyPart } from '../index.ts'
import { codeOf, running, system } from './apps.ts'
import { untilTried } from './watching.ts'

/** A provider of the tests that answers every call with a few tokens. */
const mine: Provider = {
  async *reply(): AsyncGenerator<ReplyPart> {
    yield { text: 'Hello.' }
    yield { end: { text: 'Hello.', calls: [], units: { tokensIn: 4, tokensOut: 2 } } }
  },
}

/** The app of the counts of the review, counted by caller, with the provider of the tests. */
const counting = (t: test.TestContext) =>
  running(t, { project: 'reviewCounts', engine: { makers: { providers: () => ({ mine }) } } })

/** Adds a user, and answers the caller that is that user. */
async function person(app: App, name: string): Promise<Caller> {
  const [made] = Object(await app.write([{ add: 'users', values: { name, roles: [] } }], { as: 'system' }))
  return { kind: 'user', user: { id: String(made.id), roles: [] } }
}

/** A row of the counts as the engine keeps it. */
interface Counted {
  name: string
  caller: string
  user?: string
  unit: string
  amount: number
}

/** The rows of the engine's own counts, as a program reads them. */
async function countsOf(app: App): Promise<Counted[]> {
  const rows: unknown = await app.read({ from: '_t_counts' }, { as: system })
  return (Array.isArray(rows) ? rows : []).map((one) => Object(one))
}

/** The calls of the model `writer` that were counted, by caller. */
async function callsBy(app: App): Promise<Record<string, number>> {
  const by: Record<string, number> = {}
  for (const row of await countsOf(app))
    if (row.name === 'writer' && row.unit === 'calls') by[row.caller] = (by[row.caller] ?? 0) + row.amount
  return by
}

test("[05-5.15] a query over the table that shows the counts with read: 'owner', by one user for the rows of another, through a filter, a group and with('user'): only the caller's own rows are counted and answered", async (t) => {
  const { app } = await counting(t)
  const ada = await person(app, 'Ada')
  const bo = await person(app, 'Bo')
  await app.call('ask', { words: 'Hi.' }, { as: ada })
  await app.call('ask', { words: 'Hi.' }, { as: bo })
  await app.call('ask', { words: 'Hi again.' }, { as: bo })
  const theirs: unknown = await app.call('usageOf', { user: String(bo.user?.id) }, { as: ada })
  assert.deepEqual(theirs, [], 'a filter for the rows of another answers none of them')
  const grouped: unknown = await app.call('usageGrouped', {}, { as: ada })
  const groups = (Array.isArray(grouped) ? grouped : []).map((one) => Object(one))
  assert.ok(
    groups.every((one) => [ada.user?.id, Object(one.user).id].includes(String(one.user?.id ?? one.user))),
    JSON.stringify(groups),
  )
  assert.ok(!JSON.stringify(groups).includes(String(bo.user?.id)), JSON.stringify(groups))
  // The sum of the group counts Ada's own calls alone: one call of 4 and 2 tokens, and the call itself.
  assert.deepEqual(
    groups.map((one) => Number(one.amount)),
    [7],
  )
  const withUser: unknown = await app.call('usageWith', {}, { as: ada })
  const rows = (Array.isArray(withUser) ? withUser : []).map((one) => Object(one))
  assert.ok(rows.length > 0)
  assert.ok(!JSON.stringify(rows).includes(String(bo.user?.id)), JSON.stringify(rows))
})

test('[05-18.7] under countBy: caller, a visitor who drops the cookie before every call is counted with the callers who have no visitor id, and the sum of the app is the same', async (t) => {
  const { app, origin } = await counting(t)
  for (let n = 0; n < 3; n++) {
    const answer = await app.request(
      new Request(`${origin}/_t/call/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({ input: { words: 'Hi.' } }),
      }),
    )
    assert.equal(answer.status, 200)
  }
  await untilTried('the calls were counted', () => true)
  const by = await callsBy(app)
  assert.deepEqual(by, { nobody: 3 }, JSON.stringify(by))
})

test('[05-18.8] a write that starts a flow by a trigger, and a call of an offered flow that runs as the system, are counted under the starter that the run holds, not under nobody', async (t) => {
  const { app } = await counting(t)
  const ada = await person(app, 'Ada')
  await app.call('addNote', { words: 'A note.' }, { as: ada })
  const [set] = app.runs.find({ flow: 'onNote' })
  assert.ok(set, 'the trigger started a run')
  await app.runs.wait(set.id)
  assert.equal(await app.call('systemWork', {}, { as: ada }), 'worked')
  const [worked] = app.runs.find({ flow: 'systemWork' })
  // A run that a trigger started holds the system as its starter; the offered flow holds Ada, who started it.
  assert.deepEqual([set.startedBy, worked?.startedBy], [{ kind: 'system' }, { kind: 'user', id: ada.user?.id }])
  const by = await callsBy(app)
  assert.deepEqual(by, { system: 1, [`user:${ada.user?.id}`]: 1 }, JSON.stringify(by))
})

test("[05-18.9] a change and raw SQL of a function that states system, that write the table which states shows: 'counts' and _t_counts, are refused: the counts are never written by an app", async (t) => {
  const { app } = await counting(t)
  const ada = await person(app, 'Ada')
  await app.call('ask', { words: 'Hi.' }, { as: ada })
  const before = JSON.stringify(await countsOf(app))
  assert.equal(await codeOf(Promise.resolve().then(() => app.call('written', { unit: 'calls' }, { as: ada }))), 'T2016')
  const raw = await codeOf(Promise.resolve().then(() => app.call('rawUsage', {}, { as: system })))
  const engines = await codeOf(Promise.resolve().then(() => app.call('rawCounts', {}, { as: system })))
  // No table of that name stands in the data: the raw write fails there, and writes nothing.
  assert.notEqual(raw, 'ok', `raw SQL on the table of the counts: ${raw}`)
  assert.ok(['T2016', 'T0013'].includes(String(engines)), `raw SQL on _t_counts: ${engines}`)
  assert.equal(JSON.stringify(await countsOf(app)), before)
})
