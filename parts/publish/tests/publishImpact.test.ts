import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keptImpact, publish } from '../index.ts'
import type { Server } from './server.ts'
import { computer, fetched, folderOf, started } from './server.ts'

const functions = 'functions/orders.ts'

/** The version that runs on a server. */
const running = (server: Server): string | undefined => server.app.versions().find((one) => one.running)?.id

test('[44-2] a publish whose impact holds wider rights is refused without accepting the impact, and is kept with its point; try answers the impact', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  const before = running(server)

  // A rule that is widened: anyone may now add an order.
  here.edit(
    functions,
    "export const addOrder = change('addOrder', {\n  access: 'signedIn',",
    "export const addOrder = change('addOrder', {\n  access: anyone('a test widens it'),",
  )
  here.edit(
    functions,
    "import { action, change, input, number, query, text } from 'tentjs'",
    "import { action, anyone, change, input, number, query, text } from 'tentjs'",
  )
  await here.save()

  // What the publish would do holds its impact, against what is live on the target.
  const tried = await publish({ project: here.project, history: here.history, to, fetch: fetched, try: true })
  assert.deepEqual(
    tried.impact?.rights.map((one) => [one.name, one.change]),
    [['addOrder', 'now callable by anyone']],
  )
  assert.equal(tried.impact?.against, 'live')
  // The impact is the one report: what the target told of itself to work it out is no part of the answer.
  assert.equal(Reflect.get(tried, 'facts'), undefined)

  // Landed with no word that the impact was read, it is refused, and nothing changes on the target.
  const refused = await publish({ project: here.project, history: here.history, to, fetch: fetched }).then(
    () => undefined,
    (error: { code?: string; fields?: Record<string, string> }) => error,
  )
  assert.deepEqual([refused?.code, refused?.fields?.reason], ['T9103', 'impact'])
  assert.equal(running(server), before)

  // Accepted, it lands, and the impact is kept with the point that was published.
  const done = await publish({ project: here.project, history: here.history, to, fetch: fetched, acceptImpact: true })
  assert.equal(running(server), done.version)
  const kept = keptImpact(here.history, done.point)
  assert.deepEqual(
    kept?.rights.map((one) => one.name),
    ['addOrder'],
  )
})
