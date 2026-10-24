import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { publish } from '../index.ts'
import type { Server } from './server.ts'
import { computer, fetched, folderOf, started } from './server.ts'

/** A query of the shop open to anyone, which answers which version answered it. */
const ping = (answer: string): string =>
  `import { query, text } from 'tentjs'\n\nexport const ping = query('ping', {\n  access: 'anyone',\n  output: text(),\n  run: () => '${answer}',\n})\n`

/** A visitor id of the form the engine makes, by its number. */
const visitorOf = (n: number): string => `${'a'.repeat(28)}${String(n).padStart(4, '0')}`

/** Calls `ping` through the door of the server as a visitor, with what else the body holds, and answers the value. */
async function pinged(server: Server, visitor: string, more: object = {}): Promise<unknown> {
  const answer = await fetch(`${server.address}/_t/call/ping`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: server.address, cookie: `tent_visitor.shop=${visitor}` },
    body: JSON.stringify({ input: {}, ...more }),
  })
  const wire = Object(await answer.json())
  return wire.ok === true ? wire.value : `failed ${String(wire.error?.code)}`
}

/**
 * A server whose second version goes gradually to half of its visitors, and the visitors the door gives each
 * version, found by asking.
 */
async function released(
  t: TestContext,
): Promise<{ server: Server; back(): Promise<unknown>; version: string; onOld: string[]; onNew: string[] }> {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  here.edit('tent.ts', "title: 'Shop' }", "title: 'Shop', release: { steps: [0.5, 1], every: '1 hour' } }")
  writeFileSync(join(here.project, 'functions', 'ping.ts'), ping('one'))
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched, acceptImpact: true })
  writeFileSync(join(here.project, 'functions', 'ping.ts'), ping('two'))
  await here.save()
  const { version } = await publish({
    project: here.project,
    history: here.history,
    to,
    fetch: fetched,
    gradual: true,
    acceptImpact: true,
  })
  const given = new Map<string, unknown>()
  for (let n = 0; n < 24; n++) given.set(visitorOf(n), await pinged(server, visitorOf(n)))
  const onOld = [...given].filter(([, answer]) => answer === 'one').map(([visitor]) => visitor)
  const onNew = [...given].filter(([, answer]) => answer === 'two').map(([visitor]) => visitor)
  assert.ok(onOld.length && onNew.length, JSON.stringify([...given]))
  const back = () => publish({ project: here.project, history: here.history, to, fetch: fetched, release: 'back' })
  return { server, back, version, onOld, onNew }
}

test('[44-10.4] a visitor of the old version who sends a user id, a visitor id or the new version is still served by the version the door gives them', async (t) => {
  const { server, version, onOld, onNew } = await released(t)
  const [mine] = onOld
  assert.ok(mine)
  // A value the caller sends picks nothing, whether it is refused or let pass.
  for (const more of [{ as: 'user:u0001' }, { visitor: onNew[0] }, { user: onNew[0] }])
    assert.notEqual(await pinged(server, mine, more), 'two', JSON.stringify(more))
  assert.equal(
    await pinged(server, mine, { version }),
    'one',
    'a visitor of the old version who names the new one in the call is not served by it',
  )
})

test('[44-10.4] taken back, every visitor is on the old version, one who names the new version too', async (t) => {
  const { server, back, version, onNew } = await released(t)
  await back()
  for (const visitor of onNew) assert.equal(await pinged(server, visitor), 'one')
  assert.notEqual(
    await pinged(server, String(onNew[0]), { version }),
    'two',
    'after the release is taken back, no call of a visitor is served by the new version',
  )
})
