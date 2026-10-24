import assert from 'node:assert/strict'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { copyOf, planted, root, start } from './rigs-plant.ts'

const program = 'scripts/pages.mjs'
const pages = (folder: string) => start(root, program, folder)
const owed = 'parts/docs/owed.json'
const ofAWord = 'Example, Options, Returns, Errors, See also'

/** Rewrites a file of a tree by a function of its text. */
function rewrite(folder: string, file: string, change: (text: string) => string): void {
  writeFileSync(join(folder, file), change(readFileSync(join(folder, file), 'utf8')))
}

/** Takes a planted page out of a tree, with the line that asks for it. */
function without(folder: string, name: string): void {
  rmSync(join(folder, `parts/docs/pages/${name}.md`))
  rewrite(folder, owed, (text) =>
    JSON.stringify(
      JSON.parse(text).filter((line: string) => line !== name),
      null,
      2,
    ),
  )
}

// Each planted case of what is owed a page: what the rig says of it, and what takes it out of a copy of the tree.
const cases = {
  'a code with no page': {
    words: 'parts/docs/pages/code.T0002.md  there is no such page: parts/engine/lost.ts names the code in a string',
    mend: (folder: string) => rmSync(join(folder, 'parts/engine/lost.ts')),
  },
  'a page that nothing asks for': {
    words: 'parts/docs/pages/code.T0404.md  a page that nothing asks for',
    mend: (folder: string) => rmSync(join(folder, 'parts/docs/pages/code.T0404.md')),
  },
  'the owed pages in another order': {
    words: `${owed}  "option.table.tenant" stands after "word.table", and the lines stand in the order of their names`,
    mend: (folder: string) => rewrite(folder, owed, (text) => JSON.stringify([...JSON.parse(text)].sort(), null, 2)),
  },
  'an entry of the list of commands with no page': {
    words: 'parts/docs/pages/command.new.md  there is no such page: parts/cli/commands/list.ts holds the entry',
    mend: (folder: string) =>
      rewrite(folder, 'parts/cli/commands/list.ts', (text) =>
        text.replace("  { name: 'new', load: () => import('./new.ts') },\n", ''),
      ),
  },
}

// Each planted page that has not the shape of its kind, with what the rig says of it.
const shapes = {
  'word.query': `the heading "Notes" is none of its kind, which has: ${ofAWord}`,
  'word.change': `the heading "Options" stands after "Returns", and the order of its kind is: ${ofAWord}`,
  'word.action': 'the section "Example" is not there, which a page of its kind always has',
  'word.flow': 'no lead stands under its title: a heading stands there',
  'word.project': 'no lead stands under its title: a list stands there',
  'word.model': 'its example does not show its thing: `model`',
  'option.table.rows': 'its example does not show its thing: `rows`',
  'word.start': 'its section "Example" holds no code block',
  'word.service': 'its first line is not the title of its kind, which is: # `service`',
}

/** A copy of the planted tree with every case taken out but those of `kept`, and every page of `shaped` left in. */
function copyWith(t: TestContext, kept: string[], shaped: string[] = []): string {
  const folder = copyOf(t, '5')
  for (const name of Object.keys(shapes)) if (!shaped.includes(name)) without(folder, name)
  for (const [name, { mend }] of Object.entries(cases)) if (!kept.includes(name)) mend(folder)
  return folder
}

test('[03-5] a code with no page, a page that nothing asks for, owed pages out of order and a command with no page each fail', (t) => {
  const all = pages(planted('5'))
  assert.equal(all.code, 1, all.out)
  for (const { words } of Object.values(cases)) assert.ok(all.out.includes(words), `${words}\nis not in:\n${all.out}`)
  assert.match(all.out, /^13 found\.$/m)
  // A code in a comment, in a file of a `tests/` folder, in a project of a check rule and in the registry asks for no page.
  assert.doesNotMatch(all.out, /T0003|T0004|T0005|T0009|topic\.start/)

  for (const [name, { words }] of Object.entries(cases)) {
    const alone = pages(copyWith(t, [name]))
    assert.equal(alone.code, 1, alone.out)
    assert.ok(alone.out.includes(words), alone.out)
    assert.match(alone.out, /^1 found\.$/m)
  }

  const none = pages(copyWith(t, []))
  assert.equal(none.code, 0, none.out)
  assert.match(none.out, /^9 pages asked for, 10 pages\. Nothing found\.$/m)
})

test('[03-5] a page with a heading that is not of its kind or out of its order, one that lacks a needed section, one with no lead, and one whose example does not show its thing each fail', (t) => {
  const all = pages(planted('5'))
  assert.equal(all.code, 1, all.out)
  for (const [name, words] of Object.entries(shapes))
    assert.ok(all.out.includes(`parts/docs/pages/${name}.md  ${words}`), `${name}: ${words}\nis not in:\n${all.out}`)
  // A page of each kind that has the shape of its kind is not named for it.
  const shaped = /(?:code\.T0001|command\.(?:access|build)|tag\.Link|hook\.useCall|handle\.log)\.md/
  assert.doesNotMatch(all.out, shaped)
  assert.doesNotMatch(all.out, /(?:word\.table|option\.table\.tenant|adapter\.Mailer|topic\.start)\.md/)

  for (const [name, words] of Object.entries(shapes)) {
    const alone = pages(copyWith(t, [], [name]))
    assert.equal(alone.code, 1, `${name}:\n${alone.out}`)
    assert.ok(alone.out.includes(`parts/docs/pages/${name}.md  ${words}`), alone.out)
    assert.match(alone.out, /^1 found\.$/m)
  }
})

test('[03-5] everything that is built in the repository has its page', () => {
  const ended = start(root, program)
  assert.equal(ended.code, 0, ended.out)
})
