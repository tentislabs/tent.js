import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { opened, sharedPython, untilWithin } from './pythonApps.ts'
import { notDropped } from './started.ts'

const shared = sharedPython('say')

test('[27-16] a value that a python says with tent.say, in the step of a run, reaches the page that follows the run', async (t) => {
  const { app, dataFolder, user } = await opened(t, shared)
  const maya = await user()
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  const origin = `http://localhost:${port}`
  const cookie = app.session(String(maya.user?.id))
  // The page says who it holds itself to be: a caller other than that is told to load the page again.
  const as = encodeURIComponent(String(maya.user?.id))
  const live = app.live(new Request(`${origin}/_t/live?as=${as}`, { headers: { origin, cookie } }))
  const got: Record<string, unknown>[] = []
  live.each((message) => {
    if (message.t === 'alive') live.send({ t: 'alive' })
    else got.push(message)
  })
  t.after(() => live.close())
  const { run } = notDropped(await app.start('sayingFlow', {}, { as: maya }))
  live.send({ t: 'run-watch', id: 'r', run })
  const ended = (): boolean =>
    got.some((one) => one.kind === 'done' || one.kind === 'failed' || one.t === 'failed' || one.state === 'done')
  await untilWithin(ended, 'the run ended', 60_000).catch(() => assert.fail(JSON.stringify([app.runs.read(run), got])))
  assert.equal(
    got.some((one) => one.kind === 'failed' || one.t === 'failed'),
    false,
    JSON.stringify(got),
  )
  const said = [
    ...got.filter((one) => one.t === 'run').flatMap((one) => (Array.isArray(one.said) ? one.said : [])),
    ...got.filter((one) => one.kind === 'said'),
  ].map((one) => Reflect.get(Object(Reflect.get(Object(one), 'value')), 'at'))
  assert.ok(said.length > 0, JSON.stringify(got))
  assert.equal(said.at(-1), 3)
})
