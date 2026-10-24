import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findPage } from '../index.ts'

/** The text of a page, which must be there. */
function pageOf(name: string): string {
  const page = findPage(name)
  assert.ok(page, `the page ${name} is there`)
  return page.text
}

test('[32-10] the pages say that the head of a page of several languages names the screen in every language, itself among them, and x-default, and no sentence says it names the other languages alone', () => {
  for (const name of ['option.project.languages', 'option.screen.seo']) {
    const text = pageOf(name)
    assert.match(text, /x-default/, `${name} names x-default`)
    assert.doesNotMatch(
      text,
      /in (?:every|each) other language/,
      `${name} says no more that the head names the other languages alone`,
    )
  }
})
