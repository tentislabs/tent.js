import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { copied, shell, typed } from './typed.ts'

/** What ends what a test started, before the folder of the test is removed: asked for before the folder is made. */
function endings(t: TestContext): (() => Promise<void>)[] {
  const ends: (() => Promise<void>)[] = []
  t.after(async () => {
    for (const end of ends) await end()
  })
  return ends
}

/** A client that starts `tent mcp` in a project, as a chat app on this computer does, and speaks to it line by line. */
function started(ends: (() => Promise<void>)[], project: string) {
  const child = spawn(process.execPath, [shell, 'mcp'], { cwd: project, stdio: ['pipe', 'pipe', 'pipe'] })
  const ended = new Promise<void>((done) => child.once('exit', () => done()))
  ends.push(async () => {
    child.stdin.end()
    child.kill()
    await ended
  })
  const answers = new Map<number, Record<string, unknown>>()
  let held = ''
  let said = ''
  child.stdout.setEncoding('utf8').on('data', (piece: string) => {
    held += piece
    for (let end = held.indexOf('\n'); end >= 0; end = held.indexOf('\n')) {
      const answer: Record<string, unknown> = Object(JSON.parse(held.slice(0, end)))
      held = held.slice(end + 1)
      if (typeof answer.id === 'number') answers.set(answer.id, answer)
    }
  })
  child.stderr.setEncoding('utf8').on('data', (piece: string) => {
    said += piece
  })
  let ids = 0
  const send = (method: string, params: object, note = false): number => {
    ids += note ? 0 : 1
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...(note ? {} : { id: ids }), method, params })}\n`)
    return ids
  }
  const asked = async (method: string, params: object): Promise<Record<string, unknown>> => {
    const id = send(method, params)
    for (const until = performance.now() + 120_000; performance.now() < until && !answers.has(id); )
      await new Promise((done) => setTimeout(done, 20))
    const answer = answers.get(id)
    assert.ok(answer, `no answer to ${method}: ${said}`)
    return Object(answer.result)
  }
  return { send, asked, said: () => said }
}

// A file of the project with a mistake that the check finds.
const broken = `import { query } from 'tentjs'

export const waits = query('waits', { access: 'signedIn', run: async ({ db }) => db.orders.limit(5).all() })
`

test('[25-10] a client that starts tent mcp lists the eight tools, tent_run as not reading only, and tent_check answers the findings of the project', async (t) => {
  const ends = endings(t)
  const project = copied(t, 'mcp-listed')
  writeFileSync(join(project, 'functions', 'waits.ts'), broken)
  const client = started(ends, project)
  const opened = await client.asked('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'a client of the tests', version: '1' },
  })
  assert.equal(opened.protocolVersion, '2025-11-25')
  client.send('notifications/initialized', {}, true)
  const listed = await client.asked('tools/list', {})
  const tools: Record<string, unknown>[] = Array.isArray(listed.tools) ? listed.tools.map(Object) : []
  assert.deepEqual(tools.map((one) => one.name).sort(), [
    'tent_check',
    'tent_docs',
    'tent_history',
    'tent_logs',
    'tent_map',
    'tent_rows',
    'tent_run',
    'tent_shot',
  ])
  for (const one of tools) assert.equal(Object(one.annotations).readOnlyHint, one.name !== 'tent_run', String(one.name))
  const check = await client.asked('tools/call', { name: 'tent_check', arguments: {} })
  const answer = Object(check.structuredContent)
  const typedCheck = await typed(project, 'check', '--json')
  assert.ok(Array.isArray(answer.findings) && answer.findings.length > 0, JSON.stringify(check))
  assert.deepEqual(
    answer.findings.map((one: unknown) => Object(one).code),
    (typedCheck.answer.findings ?? []).map((one) => one.code),
  )
  assert.equal(answer.ok, typedCheck.answer.ok)
})

test('[05-13.40] tent mcp beside an engine on live data says so when it starts, and tent_run acts as the caller its as names', async (t) => {
  const ends = endings(t)
  const project = copied(t, 'mcp-on-live')
  const built = await buildProject(project, { for: 'release' })
  assert.deepEqual(built.findings, [])
  const engine = createEngine({ port: 0 })
  ends.push(() => engine.close())
  const app = await engine.open(built.bundleFolder, { dataFolder: join(project, '.tent'), mode: 'live' })
  const made: unknown[] = Object(
    await app.write([{ add: 'users', values: { name: 'Cem', roles: [] } }], { as: 'system' }),
  )
  const id = String(Object(made[0]).id)
  const client = started(ends, project)
  await client.asked('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 't', version: '1' },
  })
  assert.match(client.said(), /live data/)
  const as = await client.asked('tools/call', { name: 'tent_run', arguments: { name: 'whoAmI', as: id } })
  assert.equal(Object(Object(as.structuredContent).value).value, id, JSON.stringify(as))
  const system = await client.asked('tools/call', { name: 'tent_run', arguments: { name: 'whoAmI' } })
  assert.equal(Object(system.structuredContent).ok, true, JSON.stringify(system))
})
