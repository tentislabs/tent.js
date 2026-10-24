import assert from 'node:assert/strict'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { History } from '../../history/index.ts'
import { openHistory } from '../../history/index.ts'
import type { Edits } from './merging.ts'
import { ada, describedNow, edit, textIn } from './merging.ts'
import { copied } from './typed.ts'

const tables = 'tables/orders.ts'

/** The project `merging`, changed first as the base asks, with main and the branch `side` each changed after it. */
async function twoSidesOf(t: TestContext, name: string, base: Edits, ours: Edits, theirs: Edits) {
  let history: History | undefined
  t.after(() => history?.close())
  const project = copied(t, name, 'merging')
  edit(project, base)
  history = openHistory(join(project, '.tent'))
  history.record(project, { by: ada, kind: 'save', description: await describedNow(project) })
  history.branch('side')
  history.switch(project, 'side', ada)
  edit(project, theirs)
  history.record(project, { by: ada, kind: 'save', description: await describedNow(project) })
  history.switch(project, 'main', ada)
  edit(project, ours)
  history.record(project, { by: ada, kind: 'save', description: await describedNow(project) })
  return { project, history }
}

/** Both sides change other fields of the table `orders`, whose text reads a name the file brought in. */
const bothChange: [Edits, Edits] = [
  { [tables]: [['title: text({ min: 1, max: 80 })', 'title: text({ min: 2, max: 80 })']] },
  { [tables]: [['total: number({ min: 0 })', 'total: number({ min: 1 })']] },
]

test('[40-4] a plain definition that both changed, whose text reads a name imported on lines of their own, is never written with the value in place of the name', async (t) => {
  const limits = 'export const NOTE_MAX = 200\nexport const TITLE_MAX = 80\n'
  const base: Edits = {
    'tables/limits.ts': limits,
    [tables]: [
      [
        "import { boolean, choice, number, table, text } from 'tentjs'\n",
        "import { boolean, choice, number, table, text } from 'tentjs'\nimport {\n  NOTE_MAX,\n  TITLE_MAX,\n} from './limits'\n",
      ],
      ['note: text({ optional: true, max: NOTE_LENGTH })', 'note: text({ optional: true, max: NOTE_MAX })'],
    ],
  }
  const two = await twoSidesOf(t, 'merge-reads-lines', base, ...bothChange)
  const merged = two.history.merge(two.project, 'side', ada)
  const text = textIn(two.project, tables)
  if (merged.clashes.length === 0) assert.match(text, /max: NOTE_MAX/, `the merged text reads the name still:\n${text}`)
  else assert.equal(merged.point?.unsettled, true)
})

test('[40-4] a plain definition that both changed, whose text reads a name the file gives by taking a list apart, is never written with the value in place of the name', async (t) => {
  const base: Edits = {
    [tables]: [
      ['const NOTE_LENGTH = 200\n', 'const NOTE_LENGTH = 200\nconst [NOTE_MAX] = [300]\n'],
      ['note: text({ optional: true, max: NOTE_LENGTH })', 'note: text({ optional: true, max: NOTE_MAX })'],
    ],
  }
  const two = await twoSidesOf(t, 'merge-reads-list', base, ...bothChange)
  const merged = two.history.merge(two.project, 'side', ada)
  const text = textIn(two.project, tables)
  if (merged.clashes.length === 0) assert.match(text, /max: NOTE_MAX/, `the merged text reads the name still:\n${text}`)
  else assert.equal(merged.point?.unsettled, true)
})
