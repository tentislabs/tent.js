import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { copyOf, planted, root, start } from './rigs-plant.ts'

const program = 'scripts/search.mjs'
const search = (folder: string) => start(root, program, folder)

// Each planted export that nothing uses: its file, its line there, and how the search names it.
const exports = {
  spare: {
    file: 'parts/core/value.ts',
    line: 'export const spare = 2\n',
    named: /^spare\s+parts\/core\/value\.ts:5:14\s*$/m,
  },
  Spare: {
    file: 'parts/core/type.ts',
    line: 'export type Spare = { more: number }\n',
    named: /^Spare\s+type\s+parts\/core\/type\.ts:2:13\s*$/m,
  },
}

/** A copy of the planted tree of the exports, without the line of each export of `without`. */
function copyWithout(t: TestContext, without: string[]): string {
  const folder = copyOf(t, '17')
  for (const [name, { file, line }] of Object.entries(exports)) {
    const text = readFileSync(join(folder, file), 'utf8')
    assert.ok(text.includes(line))
    if (without.includes(name)) writeFileSync(join(folder, file), text.replace(line, ''))
  }
  return folder
}

test('[03-17] an export, and an exported type, that no entry file gives and nothing uses each fail the search and are named', (t) => {
  const both = search(planted('17'))
  assert.equal(both.code, 1, both.out)
  for (const { named } of Object.values(exports)) assert.match(both.out, named)
  assert.match(both.out, /^Unused exports \(1\)/m)
  assert.match(both.out, /^Unused exported types \(1\)/m)
  // What an entry file gives, what a list loads, what a test imports, and what a file of the rigs gives counts as used.
  assert.doesNotMatch(both.out, /given|Given|first|shared|held|tool|Unused files/)

  for (const [one, { named }] of Object.entries(exports)) {
    const others = Object.keys(exports).filter((other) => other !== one)
    const alone = search(copyWithout(t, others))
    assert.equal(alone.code, 1, alone.out)
    assert.match(alone.out, named)
    assert.equal(alone.out.match(/^Unused /gm)?.length, 1, alone.out)
  }

  const none = search(copyWithout(t, Object.keys(exports)))
  assert.equal(none.code, 0, none.out)
})

test('[03-18] a file that nothing imports and no list names fails the search, and is named', (t) => {
  const files = ['parts/core/alone.ts', 'tests/left.ts']
  const both = search(planted('18'))
  assert.equal(both.code, 1, both.out)
  assert.match(both.out, /^Unused files \(2\)/m)
  for (const file of files) assert.ok(new RegExp(`^${file.replaceAll('.', '\\.')}\\s*$`, 'm').test(both.out), both.out)
  assert.doesNotMatch(both.out, /first\.ts|value\.ts|some-shared\.ts|list\.ts/)
  // A file of a sample app, which nothing imports, is not named: it is found by its folder.
  assert.equal(existsSync(join(planted('18'), 'samples/app-1/tables/orders.ts')), true)
  assert.doesNotMatch(both.out, /samples/)

  for (const one of files) {
    const alone = search(
      copyOf(
        t,
        '18',
        files.filter((other) => other !== one),
      ),
    )
    assert.equal(alone.code, 1, alone.out)
    assert.match(alone.out, /^Unused files \(1\)/m)
    assert.ok(alone.out.includes(one), alone.out)
  }

  const none = search(copyOf(t, '18', files))
  assert.equal(none.code, 0, none.out)
})

test('[03-18] the repository holds no file and no export that nothing uses', () => {
  const ended = start(root, program)
  assert.equal(ended.code, 0, ended.out)
})
