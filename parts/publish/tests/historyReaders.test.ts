import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { createEngine } from '../../engine/index.ts'
import { openHistory } from '../../history/index.ts'
import { followHistory, publish, pull, push, serveSync } from '../index.ts'
import { ada, closing, computer, fetched, folderOf, started } from './server.ts'

const functions = 'functions/orders.ts'

test('[29-11] after a publish, a push and a take-over, the new writer answers a pull with the pushed points, and goes back with tent publish --back', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder, { open: { insecure: true } })
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  const first = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  here.edit(functions, ".limit(input('limit'))", '.limit(50)')
  await here.save()
  const second = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  here.edit(functions, '.limit(50)', '.limit(60)')
  await here.save()
  await push({ history: here.history, to, fetch: fetched })
  const pushed = server.history.pointer('main')

  // A reader of the server keeps the history of its writer beside its data, as the writer keeps it.
  const engine = createEngine({ port: 0 })
  const readerData = join(folder, 'reader')
  const reader = await engine.read({
    from: server.address,
    key: server.key(['copy']).key,
    dataFolder: readerData,
    insecure: true,
  })
  const history = openHistory(readerData)
  closing(t, async () => {
    follower.close()
    await engine.close()
    history.close()
  })
  serveSync(engine, reader, history)
  const follower = followHistory({
    history,
    from: { address: server.address, key: server.key(['copy']).key },
    fetch: fetched,
  })
  await follower.now()
  assert.equal(history.pointer('main'), pushed, 'the reader holds the pushed point')
  assert.equal(history.pointer('live'), server.history.pointer('live'), 'and what is live')

  // The writer is gone: the reader takes over, and answers a pull and a publish --back as the writer did.
  await server.engine.close()
  await reader.takeOver()
  const port = Number(JSON.parse(readFileSync(join(readerData, 'engine.json'), 'utf8')).port)
  const now = { address: `http://127.0.0.1:${port}`, key: to.key }
  const other = computer(t, folder, 'other')
  await pull({ project: other.project, history: other.history, from: now, fetch: fetched, by: ada })
  assert.ok(pushed && other.history.read(pushed), 'the new writer answers a pull with the pushed points')
  const back = await publish({ project: here.project, history: here.history, to: now, fetch: fetched, back: true })
  assert.equal(back.version, first.version)
  assert.equal(
    reader.versions().find((one) => one.running)?.id,
    first.version,
    `the new writer went back from ${second.version}`,
  )
})
