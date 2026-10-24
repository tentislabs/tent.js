import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { copyOf, planted, programs, root, start } from './rigs-plant.ts'

const borrowed = (folder: string) => start(root, programs.borrowed, folder)

// Each planted package, with the words the rig names it by.
const cases = {
  'no-row': /`no-row` 2\.0\.0 of package\.json has no row$/m,
  'not-brought': /`not-brought` 4\.0\.0 of the lock stands in no `Brings` cell$/m,
  'other-row': /`other-row` 5\.0\.0 of package\.json has no row: the row of its name holds 5\.0\.1$/m,
  loose: /`loose` \^6\.0\.0 of package\.json is named at no exact version$/m,
  stale: /`stale` 7\.0\.0 of the lock stands in no `Brings` cell: a cell holds it as 7\.0\.1$/m,
}
const names = Object.keys(cases)

/** A copy of the planted tree whose `package.json` and lock hold none of `packages`. */
function copyWithout(t: TestContext, packages: string[]): string {
  const folder = copyOf(t, '26')
  const named = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(join(folder, 'package-lock.json'), 'utf8'))
  for (const name of packages) {
    delete named.devDependencies[name]
    delete lock.packages[''].devDependencies[name]
    delete lock.packages[`node_modules/${name}`]
  }
  writeFileSync(join(folder, 'package.json'), JSON.stringify(named, null, 2))
  writeFileSync(join(folder, 'package-lock.json'), JSON.stringify(lock, null, 2))
  return folder
}

test('[03-26] a package with no row, one that no row brings, and a version that differs each fail and are named', (t) => {
  const all = borrowed(planted('26'))
  assert.equal(all.code, 1, all.out)
  for (const words of Object.values(cases)) assert.match(all.out, words)
  assert.doesNotMatch(all.out, /`with-row`|`brought`/)

  for (const [one, words] of Object.entries(cases)) {
    const others = names.filter((other) => other !== one)
    const alone = borrowed(copyWithout(t, others))
    assert.equal(alone.code, 1, alone.out)
    assert.match(alone.out, words)
    assert.match(alone.out, /^1 found\.$/m)
  }

  const none = borrowed(copyWithout(t, names))
  assert.equal(none.code, 0, none.out)
})

test('[03-26] every package of the repository and of its lock stands in the file of borrowed parts', () => {
  const ended = borrowed(root)
  assert.equal(ended.code, 0, ended.out)
})
