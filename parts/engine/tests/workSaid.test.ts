import assert from 'node:assert/strict'
import test from 'node:test'
import type { Frame } from '../index.ts'
import { portOf } from './apps.ts'
import { cookieOf, watcher } from './watching.ts'
import { person, realWorker, untilAsync, writerFor } from './workUse.ts'
import { notDropped } from './started.ts'

test('[27-16] a value that work on a worker says reaches the page that follows its run, and no more than ten a second cross the link', async (t) => {
  const writer = await writerFor(t)
  const app = writer.app()
  const ada = await person(app, 'Ada')
  const crossed: string[] = []
  const sent = (frame: Frame): void => {
    if (typeof frame === 'string' && frame.includes('"what":"say"')) crossed.push(frame)
  }
  await realWorker(t, writer, { sent })
  const origin = `http://localhost:${portOf(writer.dataFolder)}`
  const id = String(ada.user?.id)
  const page = watcher(app, origin, { cookie: cookieOf(app, id), as: id })
  const began = performance.now()
  const { run } = notDropped(await app.start('sayOnGpu', {}, { as: ada }))
  page.send({ t: 'run-watch', id: 'r', run })
  await untilAsync('the run ended', () => app.runs.read(run)?.state === 'done')
  const seconds = (performance.now() - began) / 1000
  await untilAsync('the end was sent', () => page.got.some((one) => one.kind === 'done'))
  const said = page.got.filter((one) => one.kind === 'said').map((one) => Reflect.get(Object(one.value), 'at'))
  assert.ok(said.length > 0, 'what the work said reached the page')
  assert.ok(crossed.length > 0 && crossed.length <= Math.ceil(seconds * 10) + 2, `${crossed.length} in ${seconds} s`)
  assert.equal(Reflect.get(Object(JSON.parse(crossed.at(-1) ?? '{}').value), 'at'), 200, 'the last one crossed')
})
