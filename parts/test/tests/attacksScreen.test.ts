import assert from 'node:assert/strict'
import { cpSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { LiveServed } from './living.ts'
import { servedLive } from './living.ts'

/** Asks for a screen again with the words of the test, and answers the status with what the wire form holds. */
async function again(
  at: LiveServed,
  asked: Record<string, string>,
): Promise<{
  status: number
  value: Record<string, unknown>
  error: Record<string, unknown>
  location: string | null
}> {
  const answer = await fetch(`${at.origin}/_t/screen?${new URLSearchParams(asked)}`, { redirect: 'manual' })
  const body = Object(await answer.json().catch(() => ({})))
  return {
    status: answer.status,
    value: Object(body.value),
    error: Object(body.error),
    location: answer.headers.get('location'),
  }
}

/** Whether an address that a page is told to go to, or to leave for, is a path of the app: one slash, and then no second one. */
const inTheApp = (address: unknown): boolean => typeof address === 'string' && /^\/(?![/\\])[^\\]*$/.test(address)

test('[05-4.9] /_t/screen with a path that is an outside address, or that starts with two slashes, is not found: no answer names an address outside the app, also where the path reads as two slashes only once its dots are taken out', async (t) => {
  const at = await servedLive(t)
  // What is written as another site, or as no path at all: not found, with nothing that a page would go to.
  const outside = [
    'https://evil.tent.test/',
    'http://evil.tent.test',
    '//evil.tent.test',
    '//evil.tent.test/',
    '///evil.tent.test/',
    '/\\evil.tent.test',
    '\\\\evil.tent.test',
    '/\\/evil.tent.test/',
    'javascript:alert(1)',
    'data:text/html,x',
    'evil.tent.test',
    '',
  ]
  for (const path of outside) {
    const answer = await again(at, { path })
    assert.deepEqual([answer.status, answer.error.code, answer.value, answer.location], [404, 'T0001', {}, null], path)
  }
  // What reads as two slashes once a tab, a line break or a dot segment is taken out of it, as a browser and the
  // runtime read an address: whatever is answered, a page is led to no other site by it.
  const hidden = [
    '/\t/evil.tent.test/',
    '/\n/evil.tent.test/',
    '/\r\n/evil.tent.test',
    '/.//evil.tent.test/',
    '/..//evil.tent.test/',
    '/page/..//evil.tent.test/',
    '/././/evil.tent.test/',
    '/%2e//evil.tent.test/',
    '/%2e%2e//evil.tent.test/',
    '/page/%2E%2E//evil.tent.test/?x=1',
    '/.//evil.tent.test/page/',
    '/..//evil.tent.test',
  ]
  for (const path of hidden) {
    const answer = await again(at, { path })
    assert.equal(answer.location, null, path)
    for (const key of ['goTo', 'leave'])
      if (key in answer.value)
        assert.equal(
          inTheApp(answer.value[key]),
          true,
          `${JSON.stringify(path)} answered ${JSON.stringify(answer.value)}`,
        )
  }
  // The address itself, asked for by a browser that took the dots out, sends a visitor to no other site either.
  for (const path of ['//evil.tent.test/', '///evil.tent.test/', '/.//evil.tent.test/']) {
    const answer = await fetch(at.origin + path, { redirect: 'manual' })
    const location = answer.headers.get('location')
    assert.equal(location === null || inTheApp(location), true, `GET ${path} sent the visitor on to ${location}`)
  }
})

test('[05-4.9] /_t/screen with a version that holds .. is T0007 with the running version, also where a bundle lies at the place that it names', async (t) => {
  const at = await servedLive(t)
  const version = String(Object(await (await fetch(`${at.origin}/_t/health`)).json()).value.version)
  // The bundle itself lies where such a name would lead: beside `versions/`, and in it under a name that is no version.
  mkdirSync(join(at.dataFolder, 'versions'), { recursive: true })
  for (const place of [join(at.dataFolder, 'planted'), join(at.dataFolder, 'versions', 'planted')])
    cpSync(at.bundleFolder, place, { recursive: true })
  const named = [
    '..',
    '../planted',
    '..\\planted',
    'planted',
    './planted',
    `../versions/${version}`,
    `./${version}`,
    `${version}/`,
    `${version}/..`,
    `${version}/../${version}`,
    `${version}%2F..`,
    '%2e%2e/planted',
    at.bundleFolder,
    join(at.dataFolder, 'planted'),
    `${version}\u0000`,
    '',
  ]
  for (const one of named)
    for (const path of ['/', '/optimistic', '/no/such/screen']) {
      const answer = await again(at, { path, version: one })
      assert.deepEqual(
        [answer.status, answer.error.code, answer.error.running, answer.value],
        [409, 'T0007', version, {}],
        `${JSON.stringify(one)} for ${path}`,
      )
    }
  // The running version is served under its own name, and nothing was made loadable by the asking.
  assert.equal((await again(at, { path: '/', version })).value.screen, 'cardsScreen')
  assert.deepEqual(
    at.app.versions().map((one) => one.id),
    [version],
  )
  // The same names in a call and in a read through the door.
  for (const one of ['..', '../planted', 'planted', at.bundleFolder]) {
    const post = { method: 'POST', headers: { 'content-type': 'application/json', origin: at.origin } }
    for (const address of ['/_t/call/allCards', '/_t/read/allCards']) {
      const answer = await fetch(at.origin + address, { ...post, body: JSON.stringify({ input: {}, version: one }) })
      assert.deepEqual([answer.status, Object(await answer.json()).error?.code], [409, 'T0007'], `${address} ${one}`)
    }
  }
})
