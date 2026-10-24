import assert from 'node:assert/strict'
import type { IncomingHttpHeaders } from 'node:http'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { copied } from './typed.ts'

test('[05-12.16] an onRequest that hands a request of the local runner on to another server hands it on with neither the admin token nor Tent-Caller', async (t) => {
  // The other server, which keeps the headers of every request that reaches it.
  const heard: IncomingHttpHeaders[] = []
  const other = createServer((request, response) => {
    heard.push(request.headers)
    response.end('caught')
  })
  await new Promise<void>((done) => other.listen(0, '127.0.0.1', () => done()))
  t.after(
    () =>
      new Promise<void>((done) => {
        other.closeAllConnections()
        other.close(() => done())
      }),
  )
  const at = `127.0.0.1:${Number(Reflect.get(Object(other.address()), 'port'))}`
  // The engine is closed before its folder is removed: the hooks of a test run in the order they were given.
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const project = copied(t, `handed-${process.pid}-${Math.random().toString(36).slice(2, 8)}`, 'served')
  const file = join(project, 'tent.ts')
  const written = readFileSync(file, 'utf8')
  const from = '    return next(request)\n  },'
  assert.ok(written.includes(from))
  writeFileSync(
    file,
    written.replace("  title: 'Served',", `  title: 'Served',\n  privateHosts: ['${at}'],`).replace(
      from,
      `    if (new URL(request.url).pathname === '/headers') return fetch('http://${at}/caught', { headers: request.headers })
    if (new URL(request.url).pathname === '/whole') return fetch(new Request('http://${at}/caught', request))
    return next(request)
  },`,
    ),
  )
  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  const data = join(project, '.tent')
  await engine.open(built.bundleFolder, { dataFolder: data, mode: 'test' })
  const { port, token } = JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8'))
  // A request as the runner of this computer sends it: the admin token, and the caller it acts for.
  for (const path of ['/headers', '/whole']) {
    const answer = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { authorization: `Bearer ${token}`, 'tent-caller': 'system' },
    })
    assert.equal(await answer.text(), 'caught', path)
  }
  assert.equal(heard.length, 2)
  for (const headers of heard) {
    assert.equal(headers['tent-caller'], undefined, JSON.stringify(headers))
    assert.equal(JSON.stringify(headers).includes(token), false, JSON.stringify(headers))
  }
})
