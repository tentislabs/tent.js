import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { createEngine } from '../../engine/index.ts'
import { followServer, publish } from '../index.ts'
import { closing, computer, fetched, folderOf, started } from './server.ts'

// The review of the mending, of `publish`: what a server that follows holds a new version to, at every turn.

test('[40-15b] [40-7] a server that follows never takes a version whose health query fails there, at the turn that fetched it nor at the next one', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  const first = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  const engine = createEngine({ port: 0 })
  const told: string[] = []
  const follower = await followServer({
    engine,
    from: server.key(['bundle']),
    fetch: fetched,
    dataFolder: join(folder, 'follower'),
    every: 60_000,
    told: (line) => told.push(line),
  })
  closing(t, async () => {
    follower.close()
    await engine.close()
  })
  const runs = (): string | undefined =>
    follower
      .app()
      ?.versions()
      .find((one) => one.running)?.id
  assert.equal(runs(), first.version)
  // The follower holds an order, the server none: the health query of the next version fails on the follower alone.
  await follower.app()?.write([{ add: 'orders', values: { title: 'One', total: 1, state: 'open' } }], { as: 'system' })
  here.edit('tent.ts', "title: 'Shop' }", "title: 'Shop', publish: { health: 'healthy' } }")
  writeFileSync(
    join(here.project, 'functions', 'health.ts'),
    "import { number, query } from 'tentjs'\n\nexport const healthy = query('healthy', {\n  access: 'nobody',\n  output: number(),\n  run: ({ db }) => {\n    if (db.orders.count() > 0) throw new Error('down')\n    return 1\n  },\n})\n",
  )
  await here.save()
  const next = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  assert.notEqual(next.version, first.version)
  await follower.now()
  assert.equal(runs(), first.version, `the turn that fetched it does not take it: ${told.join(' | ')}`)
  await follower.now()
  assert.equal(runs(), first.version, `the next turn does not take it either: ${told.join(' | ')}`)
})
