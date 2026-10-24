import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findPage, pageNames } from '../index.ts'

/** The sections of a page under its `## ` headings, each by its heading. */
function sectionsOf(text: string): Map<string, string> {
  const sections = new Map<string, string>()
  for (const part of text.split(/^## /m).slice(1)) {
    const [heading, ...rest] = part.split('\n')
    sections.set(heading.trim(), rest.join('\n'))
  }
  return sections
}

test('[03-5] the page of code in other languages says how in four ways, each with its example, what it fits and where it runs, and the first page names it', () => {
  const page = findPage('topic.otherLanguages')
  assert.ok(page, 'the page is there')
  assert.match(page.text, /^# Code in other languages\n/)
  // Python is the framework's own, and the page sends a reader there first.
  assert.match(page.text, /`word\.python`/)
  const sections = sectionsOf(page.text)
  for (const [heading, names] of [
    ['A native package from npm', /napi-rs/],
    ['WebAssembly', /WebAssembly\.instantiate/],
    ['An outside MCP server program', /mcp: \{ command/],
    ['An HTTP service of its own', /service\(/],
  ] as const) {
    const section = sections.get(heading)
    assert.ok(section, `the page has the section ${heading}`)
    assert.match(section, /```/, `${heading} shows an example`)
    assert.match(section, names, `the example of ${heading} shows the way`)
    assert.match(section, /\*\*Fits best\*\*/, `${heading} says what it fits best`)
    assert.match(section, /\*\*Where it runs\.\*\* /, `${heading} says where it runs`)
  }
  assert.match(findPage('topic.start.dev')?.text ?? '', /`topic\.otherLanguages`/)
})

test('[03-5] no page of the docs tells a reader what they cannot do: a limit is a fact, with the way forward', () => {
  const told = pageNames().filter((name) => /\byou (?:cannot|can't|can not)\b/i.test(findPage(name)?.text ?? ''))
  assert.deepEqual(told, [])
})
