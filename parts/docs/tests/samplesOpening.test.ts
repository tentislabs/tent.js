import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findPage } from '../index.ts'

// What the builders of the docs site's opening and of the screens of sample app 5 found missing from the pages,
// each held where they looked.

/** The text of a page, which must be there. */
function pageOf(name: string): string {
  const page = findPage(name)
  assert.ok(page, `the page ${name} is there`)
  return page.text
}

/**
 * The section of a page under its `## ` heading, or from the top of a page whose title the heading is, with no
 * heading of its own after it.
 */
function sectionOf(name: string, heading: string): string {
  const text = pageOf(name)
  const start = text.startsWith(`# ${heading}\n`) ? 0 : text.indexOf(`\n## ${heading}\n`)
  assert.ok(start >= 0, `${name} has the section ${heading}`)
  const end = text.indexOf('\n## ', start + 1)
  return text.slice(start, end < 0 ? undefined : end)
}

/** Holds that each page says each thing it is asked to say. */
function says(said: [string, RegExp][]): void {
  const missing = said.filter(([name, words]) => !words.test(pageOf(name))).map(([name, words]) => `${name} ${words}`)
  assert.deepEqual(missing, [])
}

test('[03-5] the pages say what the docs site opening looked for: the files Tailwind reads and @source not, a component that draws on a canvas, a flow as a tool of an agent, changed() and its options, and a tool that asks', () => {
  const tailwind = sectionOf('topic.look.tailwind', 'Tailwind CSS')
  assert.match(tailwind, /every file of the project/)
  assert.match(tailwind, /@source not "/)
  const motion = sectionOf('topic.look.motion', 'Motion')
  assert.match(motion, /<canvas/)
  assert.match(motion, /useRef/)
  assert.match(motion, /return \(\) => cancelAnimationFrame/)
  says([
    ['option.agent.tools', /`as: 'starter'`[^.]*`code\.T7012`/],
    ['option.agent.tools', /`code\.T7009`/],
    ['option.agent.tools', /`ask 1\.1`/],
    ['option.agent.tools', /`code\.T7111`/],
    ['topic.flows', /changed\(\{ where[^)]*columns/],
    ['topic.flows', /`event\.before`/],
    ['option.change.danger', /`option\.agent\.tools`/],
    ['option.action.danger', /`option\.agent\.tools`/],
    ['option.flow.danger', /`option\.agent\.tools`/],
    ['hook.useAgent', /`danger: 'ask'`/],
  ])
})

test('[03-5] the pages say what the screens of sample app 5 looked for: a turn that waits in page.say, a value that changes after a step, a property that holds a function, the look of a screen above, and the folder of a failed step in git', () => {
  const chat = pageOf('topic.tests.browser')
  assert.match(chat, /`say` fails with `code\.T0008`/)
  assert.match(chat, /`state: 'waiting'`/)
  assert.match(chat, /follows nothing that changes after it/)
  assert.match(chat, /`results\/` in its `\.gitignore`/)
  says([
    ['option.component.props', /holds a function/],
    ['tag.Link', /::backdrop/],
    ['tag.Link', /dialog\[aria-modal="true"\]/],
    ['command.new', /`node_modules\/`[^.]*`tent\.d\.ts`/],
  ])
})
