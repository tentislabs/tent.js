import assert from 'node:assert/strict'
import { test } from 'node:test'
import { get, object, post, project, service, text } from '../index.ts'
import { describe } from '../internal.ts'

const shop = project('shop', {})

/** The codes and words of what describing the project with one service finds. */
function found(one: object): string[] {
  return describe({
    definitions: [shop, one].map((value) => ({ value })),
  }).findings.map((finding) => `${finding.code} ${finding.message}`)
}

test('[13-5] an object that `headers` names is T1014 when the project is described, for a `get` as for a `post`', () => {
  // `24`, section 2, point 2: a field that `headers` names is written into that header, and an object there is T1014.
  const input = { meta: object({ shelf: text() }) }
  const headers = { 'X-Meta': 'meta' }
  const posted = service('posted', {
    url: 'https://api.example.com',
    calls: { put: post('/items', { input, headers }) },
  })
  const asked = service('asked', {
    url: 'https://api.example.com',
    calls: { find: get('/items', { input, headers }) },
  })
  const named = (codes: string[], name: string): boolean =>
    codes.some((one) => one.startsWith(`T1014 ${name}:`) && one.includes('a header'))
  assert.ok(named(found(posted), 'posted'), JSON.stringify(found(posted)))
  assert.ok(named(found(asked), 'asked'), JSON.stringify(found(asked)))
})
