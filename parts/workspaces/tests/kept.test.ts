import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { describeProject } from '../../build/index.ts'
import { folderOf, held, product } from './held.ts'
import { toolTemplates } from './tooled.ts'
import { held as heldToBar } from '../../../rig/budgets.ts'

// How many definitions the project holds, in how many files, and how many points its history holds.
const definitions = 500
const files = 25
const points = 1000

/** Writes a plain project of many queries over one table into a folder, each with a limit of its own. */
function manyQueries(folder: string): void {
  mkdirSync(join(folder, 'functions'), { recursive: true })
  mkdirSync(join(folder, 'tables'), { recursive: true })
  writeFileSync(
    join(folder, 'tent.ts'),
    "import { project } from 'tentjs'\n\nexport const many = project('many', { title: 'Many' })\n",
  )
  writeFileSync(
    join(folder, 'tables', 'items.ts'),
    "import { anyone, table, text } from 'tentjs'\n\nexport const items = table('items', {\n  columns: { name: text() },\n  access: { read: anyone('the items of a test') },\n})\n",
  )
  const each = definitions / files
  for (let f = 0; f < files; f++) {
    const queries = Array.from(
      { length: each },
      (_, k) =>
        `export const q${f * each + k} = query('q${f * each + k}', {\n  access: anyone('the items of a test'),\n  rows: items.limit(${k + 1}),\n})\n`,
    )
    writeFileSync(
      join(folder, 'functions', `f${f}.ts`),
      `import { anyone, query } from 'tentjs'\nimport { items } from '../tables/items'\n\n${queries.join('\n')}`,
    )
  }
}

test('[40-22] compare and changedBy of a workspace answer what changed and who changed it last, after a thousand points of five hundred definitions, by the kept rows alone and within 50 ms', async (t) => {
  const folder = folderOf(t)
  const template = join(folder, 'many')
  manyQueries(template)
  const at = await held(t, { templates: { ...toolTemplates, many: template } }, await product(t, folder, 'builder'))
  const [row] = Object(
    await at.app.write([{ add: 'users', values: { email: 'ada@example.com', roles: ['builder'] } }], { as: 'system' }),
  )
  const owner = String(Object(row).id)
  const caller = { kind: 'user' as const, user: { id: owner, roles: [] } }
  const made = await at.workspaces.create({ owner, from: 'many' })
  const project = join(made.folder, 'project')
  const history = at.workspaces.history(made.id)
  const { description } = await describeProject(project)
  const first = history.record(project, { by: { kind: 'person', id: owner }, kind: 'command', description })
  // Each point changes the limit of one query, in its file and in its description, by turns of a person and the AI.
  const each = definitions / files
  for (let n = 0; n < points; n++) {
    const q = n % definitions
    const file = join(project, 'functions', `f${Math.floor(q / each)}.ts`)
    const text = readFileSync(file, 'utf8')
    const limit = 1000 + n
    writeFileSync(
      file,
      text.replace(new RegExp(`(query\\('q${q}', \\{\\n[^]*?items\\.limit\\()\\d+\\)`), `$1${limit})`),
    )
    const record: Record<string, unknown> = Object(description.functions[`q${q}`])
    record.plan = { ...Object(record.plan), limit }
    const by = n % 2 ? { kind: 'ai' as const } : { kind: 'person' as const, id: owner }
    const point = history.record(project, { by, kind: 'command', description })
    if (n === 0) {
      // A point's list of changes is written in the write that records it.
      const db = new DatabaseSync(join(made.folder, 'data', 'history.db'), { readOnly: true })
      try {
        const kept = db.prepare('SELECT changes FROM changed WHERE point = ?').get(point.id)
        assert.ok(kept, 'the changes of the point are kept with it')
        const changes = JSON.parse(String(Object(kept).changes))
        assert.deepEqual(
          changes.map((one: { name: string }) => one.name),
          ['q0'],
        )
      } finally {
        db.close()
      }
    }
  }
  const tool = (name: string, input: object) => at.workspaces.tool(made.id, name, input, { caller, agent: 'builder' })
  // The files of the project are taken away: what answers is read from the kept rows alone.
  renameSync(project, `${project}.away`)
  try {
    // One call of each first, so that what is measured is the answer and not the loading of the code.
    const one = Object(await tool('compare', { from: first.id, name: 'q7' }))
    assert.deepEqual(
      one.changes.map((change: { name: string }) => change.name),
      ['q7'],
    )
    const field = Object(await tool('changedBy', { name: 'q8', path: ['plan', 'limit'] }))
    assert.equal(field.by.kind, 'person')
    const started = performance.now()
    const whole = Object(await tool('compare', { from: first.id }))
    const compared = performance.now() - started
    assert.equal(whole.changes.length, definitions)
    const q7 = whole.changes.find((one: { name: string }) => one.name === 'q7')
    assert.deepEqual([q7.what, q7.path, q7.from, q7.to], ['query', ['plan', 'limit'], 8, 1507])
    const asked = performance.now()
    const last = Object(await tool('changedBy', { name: 'q7' }))
    const lastly = performance.now() - asked
    assert.equal(last.by.kind, 'ai')
    assert.equal(last.kind, 'command')
    heldToBar('workspace.compare', compared, 'ms')
    heldToBar('workspace.changedBy', lastly, 'ms')
  } finally {
    renameSync(`${project}.away`, project)
  }
})
