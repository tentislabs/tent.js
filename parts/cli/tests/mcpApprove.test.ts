import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine, makeSecretKey, storedValues, writeConnection } from '../../engine/index.ts'
import type { ToolServer } from './toolServer.ts'
import { toolServer } from './toolServer.ts'
import { copied, typed } from './typed.ts'

/** The project of the outside servers, with the address of each service at its stand-in, and a value for each secret. */
async function approving(
  t: TestContext,
  name: string,
  stands: { board?: ToolServer; cloud?: ToolServer },
): Promise<string> {
  const project = copied(t, name, join(import.meta.dirname, '..', '..', 'test', 'tests', 'outsided'))
  const file = join(project, 'services.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8')
      .replaceAll('http://127.0.0.1:1', stands.board?.origin ?? 'http://127.0.0.1:1')
      .replaceAll('http://127.0.0.1:3', stands.cloud?.origin ?? 'http://127.0.0.1:3')
      .replace(
        "['PROGRAM']",
        JSON.stringify([
          process.execPath,
          join(import.meta.dirname, '..', '..', 'test', 'tests', 'outsidePrograms', 'program.ts'),
        ]),
      ),
  )
  const made = await buildProject(project, { for: 'dev' })
  const data = join(project, '.tent')
  makeSecretKey(data)
  for (const secret of ['BOARD_KEY', 'CLOUD_ID', 'OPENAI_KEY', 'ANTHROPIC_KEY'])
    storedValues(data, made.description, { kind: 'secrets', name: secret, value: `test-${secret}` })
  return project
}

const tool = (name: string, description: string) => ({
  name,
  description,
  inputSchema: { type: 'object', properties: { words: { type: 'string' } } },
})

test('[25-20] tent mcp approve asks a server for its tools, shows them, and writes them with their fingerprints into mcp.lock.json, from which the build fills the calls of the service', async (t) => {
  const board = await toolServer(t, [tool('listBoards', 'Lists the boards'), tool('renameBoard', 'Renames a board')])
  const project = await approving(t, 'approve-board', { board })
  const approved = await typed(project, 'mcp', 'approve', 'board', '--json')
  assert.equal(approved.ended, 0, approved.printed)
  const shown = Object(approved.answer.value)
  assert.deepEqual(
    (Array.isArray(shown.tools) ? shown.tools : []).map((one: unknown) => Object(one).name),
    ['board.listBoards', 'board.renameBoard'],
  )
  assert.equal(
    Object(board.asked.find((one) => one.method === 'tools/list')?.headers).authorization,
    'Bearer test-BOARD_KEY',
  )
  const lock = Object(JSON.parse(readFileSync(join(project, 'mcp.lock.json'), 'utf8')))
  const listed = Object(Object(lock.board).tools)
  assert.deepEqual(Object.keys(listed), ['listBoards', 'renameBoard'])
  assert.equal(listed.listBoards.about, 'Lists the boards')
  assert.deepEqual(listed.listBoards.schema, tool('listBoards', '').inputSchema)
  assert.match(String(listed.listBoards.fingerprint), /^[0-9a-f]{16,}$/)
  const built = await buildProject(project, { for: 'dev' })
  const calls = Object(Object(built.description.services.board).calls)
  assert.deepEqual(calls.listBoards, listed.listBoards)
  // A second approval after the server changed a tool writes its new fingerprint.
  board.tools[1] = tool('renameBoard', 'Renames a board, and mails everyone')
  assert.equal((await typed(project, 'mcp', 'approve', 'board', '--json')).ended, 0)
  const again = Object(Object(JSON.parse(readFileSync(join(project, 'mcp.lock.json'), 'utf8'))).board).tools
  assert.notEqual(again.renameBoard.fingerprint, listed.renameBoard.fingerprint)
  assert.equal(again.listBoards.fingerprint, listed.listBoards.fingerprint)
})

test("[25-11] tent mcp approve --as asks with that user's connection", async (t) => {
  const cloud = await toolServer(t, [tool('whoami', 'Tells who you are')])
  // The engine of the test is closed before the folder of the test is removed: it is asked for first.
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const project = await approving(t, 'approve-cloud', { cloud })
  const built = await buildProject(project, { for: 'dev' })
  const app = await engine.open(built.bundleFolder, { dataFolder: join(project, '.tent'), mode: 'development' })
  const made: unknown[] = Object(
    await app.write([{ add: 'users', values: { name: 'Cem', roles: [] } }], { as: 'system' }),
  )
  const id = String(Object(made[0]).id)
  writeConnection(app, id, 'cloud')
  const approved = await typed(project, 'mcp', 'approve', 'cloud', '--as', id, '--json')
  assert.equal(approved.ended, 0, approved.printed)
  const asked = cloud.asked.find((one) => one.method === 'tools/list')
  assert.equal(Object(asked?.headers).authorization, `Bearer test-access-cloud-${id}`)
})
