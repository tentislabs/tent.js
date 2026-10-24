import assert from 'node:assert/strict'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { typedApart } from './typed.ts'
import { copied, root } from './typed.ts'

// The app that the examples of the page are of: `teams`, and `tasks` a tenant table by its column `team`, with one team and one task.
const tables = `import { anyone, link, table, text } from 'tentjs'

const open = anyone('the examples of a page read and write it')

export const teams = table('teams', { columns: { name: text() }, access: { read: open, add: open } })

export const tasks = table('tasks', {
  columns: { team: link('teams', { onRemove: 'remove' }), title: text() },
  tenant: 'team',
  access: { read: open, add: open },
})
`

const seed = `import { seed } from 'tentjs'

export default seed(({ db }) => {
  const north = db.teams.add({ name: 'North' })
  db.tasks.of(north.id).add({ title: 'Sweep the yard' })
})
`

const head = `import test from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'

`

test('[17-1@4] each example of the page topic.tests.data that tells of a tenant table and of many machines runs as it is written: app.rows with of, app.reader, app.kill and app.restart', (t) => {
  const page = readFileSync(join(root, 'parts', 'docs', 'pages', 'topic.tests.data.md'), 'utf8').replaceAll(
    '\r\n',
    '\n',
  )
  const from = page.indexOf('## A tenant table')
  assert.ok(from > 0)
  const examples = [...page.slice(from).matchAll(/```ts\n([\s\S]*?)```/g)].map((found) => found[1])
  assert.equal(examples.length, 3)
  for (const word of ['{ of: north.id }', 'app.reader()', 'app.kill()', 'app.restart({ reads: reader })'])
    assert.equal(examples.join('\n').includes(word), true, word)
  const project = copied(t, 'page-tests')
  writeFileSync(join(project, 'tables', 'teams.ts'), tables)
  writeFileSync(join(project, 'seed.ts'), seed)
  rmSync(join(project, 'tests', 'orders.test.ts'))
  for (const [n, example] of examples.entries())
    writeFileSync(join(project, 'tests', `page-${n}.test.ts`), head + example)
  const tested = typedApart(project, 'test', '--json')
  assert.deepEqual(
    [tested.ended, Object(tested.answer.value).passed, Object(tested.answer.value).failed],
    [0, 3, 0],
    tested.printed,
  )
})
