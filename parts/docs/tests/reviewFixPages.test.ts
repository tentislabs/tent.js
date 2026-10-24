import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findPage } from '../index.ts'

/** The text of a page, which must be there. */
function pageOf(name: string): string {
  const page = findPage(name)
  assert.ok(page, `the page ${name} is there`)
  return page.text
}

test('[03-5] the pages name the cookie of the device states as the engine names it, with __Host- over https, and the script of the head finds it by both', () => {
  for (const name of ['option.screen.state', 'topic.look.dark'])
    assert.match(pageOf(name), /over https `__Host-tent_state\.<the app's name>`/, name)
  // The script of the head reads the cookie under either name.
  const script = /```js\n\/\/ assets\/mode\.js\n([\s\S]*?)```/.exec(pageOf('topic.look.dark'))?.[1] ?? ''
  assert.match(script, /__Host-/)
  const cookie = (name: string): string => `${name}=${Buffer.from('{"dark":true}').toString('base64url')}`
  for (const name of ['tent_state.shop', '__Host-tent_state.shop']) {
    const set = { dataset: { mode: '' } }
    const read = new Function('document', script)
    read({ cookie: `tent_zone=UTC; ${cookie(name)}`, documentElement: set })
    assert.equal(set.dataset.mode, 'dark', name)
  }
})

test('[03-5] topic.users gives the id of a user that a test made in a form that strict TypeScript takes', () => {
  const text = pageOf('topic.users')
  assert.doesNotMatch(text, /\)\)\.user\.id/, 'the user of a caller may be nothing')
  assert.match(text, /\(await app\.user\(\{ \.\.\. \}\)\)\.user\?\.id/)
})

test('[03-5] the pages hand elements to a component as its children, and say that a property holding an element has no type word of its own yet', () => {
  for (const name of ['option.component.props', 'word.component']) {
    const text = pageOf(name)
    assert.doesNotMatch(text, /A property may hold elements/, name)
    assert.match(text, /as its `children`/, name)
    assert.match(text, /a property that holds an element has no type word of its own yet/i, name)
  }
})

test("[03-5] the recipe of the look names Tailwind's `@theme` and the `themes` option of daisyUI for colors of the app's own", () => {
  const text = pageOf('topic.look')
  assert.match(text, /`@theme`/)
  assert.match(text, /`themes` option of daisyUI/)
})
