import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { command, copyOf, root, start } from './rigs-plant.ts'

const lists = (folder: string, ...words: string[]) => start(root, 'scripts/lists.mjs', folder, ...words)
const commands = 'parts/cli/commands/list.ts'
// The folders of the planted tree that have a list, each with a list that is joined.
const listed = [
  'parts/cli/commands',
  'parts/cli/upgrades',
  'parts/core/values',
  'parts/docs/pages',
  'parts/engine/admin',
  'parts/screens/tags',
]

test('[03-9] a new file in a folder that has a list is put into the list, and on main a joined list that differs fails', (t) => {
  const folder = copyOf(t, '9')
  const joined = readFileSync(join(folder, commands), 'utf8')

  const onMain = lists(folder, '--main')
  assert.equal(onMain.code, 1, onMain.out)
  assert.ok(onMain.out.includes(`${commands}  the joined list differs from the list of its folder`), onMain.out)
  assert.match(onMain.out, /^1 found in 6 lists\.$/m)
  assert.equal(readFileSync(join(folder, commands), 'utf8'), joined)

  // Without the word the run goes on with the list it made: the new file stands in the order of the names.
  const made = lists(folder)
  assert.equal(made.code, 0, made.out)
  assert.ok(made.out.includes(`${commands}  made anew`), made.out)
  assert.equal(
    readFileSync(join(folder, commands), 'utf8'),
    joined.replace("  { name: 'new',", "  { name: 'check', load: () => import('./check.ts') },\n  { name: 'new',"),
  )
  assert.equal(lists(folder, '--main').code, 0)
  const laidOut = command(folder, 'lint')
  assert.equal(laidOut.code, 0, laidOut.out)
})

test('[03-9] without the new file each joined list is the one that is made, as the formatter lays it out', (t) => {
  const folder = copyOf(t, '9', ['parts/cli/commands/check.ts'])
  const onMain = lists(folder, '--main')
  assert.equal(onMain.code, 0, onMain.out)

  const joined = listed.map((path) => readFileSync(join(folder, path, 'list.ts'), 'utf8'))
  for (const path of listed) rmSync(join(folder, path, 'list.ts'))
  const made = lists(folder)
  assert.equal(made.code, 0, made.out)
  assert.deepEqual(
    listed.map((path) => readFileSync(join(folder, path, 'list.ts'), 'utf8')),
    joined,
  )
  // A folder that is none of those with a list gets none.
  assert.equal(existsSync(join(folder, 'parts/engine/fetch/list.ts')), false)
  const laidOut = command(folder, 'lint')
  assert.equal(laidOut.code, 0, laidOut.out)
})
