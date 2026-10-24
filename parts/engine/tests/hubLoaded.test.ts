import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { bundled, workFolder } from './apps.ts'

const program = fileURLToPath(new URL('./loaded/live.ts', import.meta.url))

test('[21-24@6] an app that no live connection was opened to has loaded nothing of the live hub and nothing of the borrowed WebSocket part: the first live connection loads the hub, and the first over the network the borrowed part', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, { project: 'board' }, work)
  // The runner skips every file when it finds this in what it is handed, as it is when a test starts a program.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const out = execFileSync(process.execPath, [program, bundle.folder, join(work, 'data')], {
    env,
    encoding: 'utf8',
    timeout: 120_000,
  })
  const said = Object(JSON.parse(/^said: (.*)$/m.exec(out)?.[1] ?? '{}'))
  // The app answered, and an opening that was refused is no connection.
  assert.deepEqual([said.called, said.health, said.refused], [200, 200, 'T0004'])
  assert.deepEqual(said.before, [])

  const [noNetwork, overNetwork]: string[][] = [said.noNetwork, said.overNetwork]
  assert.equal(said.got, 1, 'the watch with no network was answered')
  assert.ok(noNetwork.includes('hub/hub.ts'), 'the hub is loaded with the first live connection')
  assert.ok(noNetwork.includes('live/watch.ts'), 'the messages are loaded with the first live connection')
  assert.deepEqual(
    noNetwork.filter((file) => file.startsWith('ws/') || file.startsWith('borrowed/')),
    [],
    'a live connection with no network needs no WebSocket',
  )
  assert.equal(said.heard, 1, 'the watch over the network was answered')
  assert.ok(overNetwork.includes('borrowed/ws.ts'), 'the wrapper is loaded at the first live connection of the network')
  assert.ok(
    overNetwork.some((file) => file.startsWith('ws/')),
    'the borrowed part is loaded at the first live connection of the network',
  )
})
