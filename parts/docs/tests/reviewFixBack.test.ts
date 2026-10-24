import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findPage, pageNames } from '../index.ts'

/** The text of a page, which must be there, with the pages of its topic that stand under its name. */
function pageOf(name: string): string {
  const page = findPage(name)
  assert.ok(page, `the page ${name} is there`)
  const under = pageNames().filter((one) => one.startsWith(`${page.name}.`))
  return [page.text, ...under.map((one) => findPage(one)?.text ?? '')].join('\n')
}

test('[40-20] [52-10] the pages name the build of the box as the workspaces run it: --dev for the test side, and without it for what goes live', () => {
  for (const name of ['topic.workspaces', 'adapter.Sandbox']) {
    const text = pageOf(name)
    assert.match(text, /tent build --dev --out/, `${name} names the build of the test side with --dev`)
    // No sentence names the build of the test side as the release it no longer is.
    assert.doesNotMatch(text, /The build is `tent build --out/, `${name} names a release as the build of the box`)
    assert.doesNotMatch(text, /The commands that `run` is handed are two/, `${name} names two commands of the box`)
  }
})

test('[40-17] [40-19] topic.workspaces says what the mending of the workspaces made true: tool, turn and undo hold their caller, the live app knows its callers by identify, and tools that write go one after another', () => {
  const text = pageOf('topic.workspaces')
  assert.match(
    text,
    /`tool`, `turn` and `undo` hold their `caller` to the workspace/,
    'tool, turn and undo hold a caller',
  )
  assert.match(text, /where it is live in the product's own engine/, 'the live app is handed identify')
  assert.match(text, /Tools that write are carried out on a workspace one after another/, 'tools that write go in turn')
})
