import assert from 'node:assert/strict'
import { cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { closing, folderOf, held } from './held.ts'
import { toolTemplates } from './tooled.ts'

test('[05-16.11] a thousand workspaces made by one user in a minute: workspaces.create is called from a function of the product, which the door counts like any call', async (t) => {
  // The builder product of the tests, with a count of a caller's calls that a test runs into quickly.
  const folder = folderOf(t)
  const project = join(folder, 'builder')
  cpSync(join(import.meta.dirname, 'builder'), project, { recursive: true })
  const file = join(project, 'tent.ts')
  const written = readFileSync(file, 'utf8')
  const from = "{ title: 'The small builder' }"
  assert.ok(written.includes(from))
  writeFileSync(file, written.replace(from, "{ title: 'The small builder', limits: { callerPerMinute: 5 } }"))
  const built = await buildProject(project, { for: 'dev', out: join(folder, 'builder-bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const data = join(folder, 'builder-data')
  const app = await engine.open(built.bundleFolder, { dataFolder: data, mode: 'test' })
  const port = Number(JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port)
  const at = await held(t, { templates: toolTemplates }, { engine, app, port, folder, bundle: built.bundleFolder })
  const [row] = Object(
    await app.write([{ add: 'users', values: { email: 'ada@example.com', roles: [] } }], { as: 'system' }),
  )
  const ada = String(Object(row).id)
  // A page of Ada, signed in by a session that the test made, as a browser holds it.
  const origin = `http://localhost:${port}`
  const cookie = app.session(ada)
  const made = async (): Promise<string> => {
    const answer = await app.request(
      new Request(`${origin}/_t/call/newProject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, cookie },
        body: JSON.stringify({ input: { from: 'notes' }, as: ada }),
      }),
    )
    const wire = Object(await answer.json())
    return wire.ok === true ? 'ok' : String(Object(wire.error).code)
  }
  const answers: string[] = []
  for (let n = 0; n < 8; n++) answers.push(await made())
  assert.deepEqual(answers, ['ok', 'ok', 'ok', 'ok', 'ok', 'T0005', 'T0005', 'T0005'])
  // Only the calls that the door let through made a workspace.
  const workspaces = readdirSync(at.root).filter((one) => !one.startsWith('.'))
  assert.equal(workspaces.length, 5, workspaces.join(', '))
})
