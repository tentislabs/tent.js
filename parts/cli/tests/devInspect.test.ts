import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import { copied } from './typed.ts'

test('[34-3] tent dev --inspect <origin> prints an address in the inspect mode, which the tool of that origin may show in a frame', async (t) => {
  let started: Dev | undefined
  t.after(() => started?.close())
  const folder = copied(t, 'dev-inspect', 'devs')
  const lines: string[] = []
  const origin = 'http://127.0.0.1:4100'
  started = await startDev(folder, { port: 0, inspect: origin, out: (line) => lines.push(line) })
  const said = lines.find((line) => line.includes('t-inspect='))
  assert.ok(said, lines.join('\n'))
  const address = /http:\/\/localhost:\d+\/\?t-inspect=[A-Za-z0-9_-]{32}/.exec(said)?.[0]
  assert.ok(address, said)
  assert.ok(said.includes(origin), 'the line names the origin of the tool')
  const page = await fetch(address)
  assert.equal(page.status, 200)
  assert.match(page.headers.get('content-security-policy') ?? '', /frame-ancestors http:\/\/127\.0\.0\.1:4100/)
  assert.match(await page.text(), /"inspect":\{"origin":"http:\/\/127\.0\.0\.1:4100"\}/)
  // An origin that is no origin is refused before anything runs.
  await assert.rejects(
    startDev(copied(t, 'dev-inspect-bad', 'devs'), {
      port: 0,
      inspect: 'http://127.0.0.1:4100/tool',
      out: () => undefined,
    }),
    (error: unknown) => Reflect.get(Object(error), 'code') === 'T0002',
  )
})
