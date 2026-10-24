import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { dataPlace } from './desks.ts'
import { closing, copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

test('[45-19.11] /_t/mail asked from this computer by a name that is not its own, as a page of another site reaches it, or from another computer, is refused as a pass is', async (t) => {
  const project = copyOf(t, 'mailed')
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  const dataFolder = dataPlace(t)
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const app = await engine.open(built.bundleFolder, { dataFolder, mode: 'development' })
  await app.call('send', { message: { to: 'ada@example.com', subject: 'Your code', text: 'It is 123456' } }, system)
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  const asked = (host: string, headers: Record<string, string> = {}) =>
    app.request(new Request(`http://${host}:${port}/_t/mail`, { headers }))
  assert.equal((await asked('localhost')).status, 200, 'from this computer by its own name')
  // A page of another site that a browser on this computer opens reaches the app by a name the site chose.
  for (const host of ['shop.example.com', 'localhost.example.com', '127.0.0.1.nip.io']) {
    const answer = await asked(host, { origin: `http://${host}` })
    assert.notEqual(answer.status, 200, host)
    assert.equal((await answer.text()).includes('Your code'), false)
  }
  const far = await app.request(new Request(`http://localhost:${port}/_t/mail/x`), { from: '192.168.1.7' })
  assert.equal(far.status, 404)
})
