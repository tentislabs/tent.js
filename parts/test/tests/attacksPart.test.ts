import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { copyOf } from './projects.ts'

test('[48-7.5] /_t/part/ with no path asked in live or development answers 404 and draws nothing, however it is asked', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'tent-attack-part-'))
  t.after(() => rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const built = await buildProject(copyOf(t, 'looked'), { for: 'dev', out: join(home, 'bundle') })
  const props = encodeURIComponent(JSON.stringify({ label: 'Alone' }))
  for (const mode of ['development', 'live'] as const) {
    const engine = createEngine({ port: 0 })
    try {
      const data = join(home, mode)
      const app = await engine.open(built.bundleFolder, { dataFolder: data, mode })
      const origin = `http://localhost:${Number(JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port)}`
      const tries: [string, RequestInit][] = [
        [`/_t/part/Badge?props=${props}`, {}],
        // With the mark of a browser that a test drives, which only the mode `test` reads.
        [`/_t/part/Badge?props=${props}`, { headers: { cookie: 'tent_test=1' } }],
        [`/_t/part/%42adge?props=${props}`, {}],
        [`/_t/part/Badge/?props=${props}`, {}],
        [`/_t/part/Badge?props=${props}&path=`, {}],
        [`/_t/part/Badge`, { method: 'HEAD' }],
        // The drawing of a part on the server, with no `path`.
        [
          `/_t/part/Badge`,
          {
            method: 'POST',
            body: JSON.stringify({ props: { label: 'Alone' } }),
            headers: { 'content-type': 'application/json' },
          },
        ],
        [
          `/_t/part/Badge`,
          {
            method: 'POST',
            body: JSON.stringify({ props: { label: 'Alone' }, path: '' }),
            headers: { 'content-type': 'application/json' },
          },
        ],
      ]
      for (const [path, how] of tries) {
        const answer = await app.request(new Request(`${origin}${path}`, how))
        const what = `${mode} ${how.method ?? 'GET'} ${path} ${JSON.stringify(how.headers ?? {})}`
        assert.equal(answer.status, 404, what)
        assert.doesNotMatch(await answer.text(), /Alone|badge/, what)
      }
    } finally {
      await engine.close()
    }
  }
})
