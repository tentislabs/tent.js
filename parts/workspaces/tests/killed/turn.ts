// A program that holds the builder product with its workspaces, starts a turn, and is killed in step 2 of it, while
// the model of its first run answers, or in step 3, while the model of the round that mends the findings answers.
// A second start takes the turn up, ends it, and prints its row and the points of the kind turn.
// Run: node turn.ts <folder> <step2 | step3>
import { existsSync, mkdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { buildProject } from '../../../build/index.ts'
import { guardedFetch } from '../../../connect/index.ts'
import type { Provider, ReplyRequest } from '../../../engine/index.ts'
import { createEngine } from '../../../engine/index.ts'
import { testSecrets } from '../../../test/secrets.ts'
import { createWorkspaces } from '../../index.ts'
import { toolTemplates } from '../tooled.ts'
import { killedAt } from '../../../../rig/kill.ts'

const [folder, phase] = process.argv.slice(2)
mkdirSync(folder, { recursive: true })
const once = join(folder, 'killed-once')
const again = existsSync(once)
const named = join(folder, 'bundle.txt')
if (!existsSync(named))
  writeFileSync(
    named,
    (await buildProject(join(import.meta.dirname, '..', 'builder'), { for: 'dev', out: join(folder, 'bundle') }))
      .bundleFolder,
  )
const bundle = readFileSync(named, 'utf8')

/** The query of the notes that the turn writes, as a plain file. */
const queryOf = (n: number): string =>
  [
    "import { anyone, query } from 'tentjs'",
    "import { notes } from '../tables/users'",
    '',
    `export const counted${n} = query('counted${n}', {`,
    `  about: 'The notes of turn ${n}',`,
    "  access: anyone('the notes of a test app'),",
    `  rows: notes.newest('createdAt').limit(${n}),`,
    '})',
    '',
  ].join('\n')

// A query that orders the notes by a column they do not have, which the build finds.
const broken = queryOf(1).replace("newest('createdAt')", "newest('nothing')")

/** Stands still for good: the program is killed here, and nothing follows. */
const killedHere = async (line: string): Promise<never> => {
  // The run is written into the row of the turn right after its start answers: that is waited for first.
  await new Promise((done) => setTimeout(done, 500))
  // The run that is under way at the kill, which the start after it is to go on with.
  const { workspace } = JSON.parse(readFileSync(ids, 'utf8'))
  writeFileSync(join(folder, 'run-before.txt'), String(workspaces.history(workspace).turns()[0]?.run))
  writeFileSync(once, '')
  killedAt(line)
  throw new Error('never')
}

/** What the model answers: the turn is written, a broken file in the first start of step 3, and the end once a tool answered. */
async function answerOf(request: ReplyRequest): Promise<{ text: string; calls: object[] }> {
  const last = request.messages.at(-1)
  if (last?.who === 'tool') return { text: 'Done.', calls: [] }
  const first = /turn 1/.test(String(last?.text ?? ''))
  if (!again && phase === 'step2') return killedHere('in step 2')
  if (!again && phase === 'step3' && !first) return killedHere('in step 3')
  const text = !again && phase === 'step3' ? broken : queryOf(1)
  return { text: '', calls: [{ id: `c${request.messages.length}`, tool: 'write', input: { path: 'functions/counted.ts', text } }] }
}

const writer: Provider = {
  async *reply(request) {
    const answer = await answerOf(request)
    yield { end: { ...answer, units: { tokensIn: 1, tokensOut: 1 } } }
  },
}

const engine = createEngine({ port: 0, makers: { providers: () => ({ anthropic: writer }) } })
const dataFolder = join(folder, 'product-data')
if (!existsSync(join(dataFolder, 'secret.key')))
  testSecrets(dataFolder, JSON.parse(readFileSync(join(bundle, 'description.json'), 'utf8')), {})
const app = await engine.open(bundle, { dataFolder, mode: 'test' })
const port = Number(JSON.parse(readFileSync(join(folder, 'product-data', 'engine.json'), 'utf8')).port)
const workspaces = createWorkspaces({
  engine,
  app,
  folder: join(folder, 'workspaces'),
  address: (id) => `http://${id}.ws.test:${port}`,
  fetch: guardedFetch({ mode: 'development' }),
  templates: toolTemplates,
  trusted: ['builder'],
})
const ids = join(folder, 'ids.json')
if (!again) {
  const [user] = Object(
    await app.write([{ add: 'users', values: { email: 'ada@example.com', roles: ['builder'] } }], { as: 'system' }),
  )
  const owner = String(Object(user).id)
  const made = await workspaces.create({ owner, from: 'notes' })
  await workspaces.run(made.id)
  const [project] = Object(
    await app.write([{ add: 'projects', values: { owner, workspace: made.id } }], { as: 'system' }),
  )
  writeFileSync(ids, JSON.stringify({ workspace: made.id }))
  await workspaces.turn(made.id, 'builder', 'turn 1', {
    caller: { kind: 'user', user: { id: owner, roles: [] } },
    thread: String(Object(project).id),
  })
  writeSync(1, 'the turn ended before its kill\n')
} else {
  const { workspace } = JSON.parse(readFileSync(ids, 'utf8'))
  let [row] = workspaces.history(workspace).turns()
  for (let tried = 0; tried < 1200 && row?.state === 'working'; tried++) {
    await new Promise((done) => setTimeout(done, 50))
    ;[row] = workspaces.history(workspace).turns()
  }
  const points = workspaces.history(workspace).list({ kinds: ['turn'] })
  const written = readFileSync(join(folder, 'workspaces', workspace, 'project', 'functions', 'counted.ts'), 'utf8')
  // How often the thread of the turn holds the person's message.
  const rows = await app.read({ from: 'messages' }, { as: 'system' })
  const told = (Array.isArray(rows) ? rows : []).filter((one) => one.who === 'user' && one.text === 'turn 1').length
  const runBefore = readFileSync(join(folder, 'run-before.txt'), 'utf8')
  writeSync(
    1,
    `ended: ${JSON.stringify({ row, points: points.length, written: written === queryOf(1), told, runBefore })}\n`,
  )
}
await workspaces.close()
await engine.close()
