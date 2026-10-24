import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { TentError } from '../../core/index.ts'
import { testApp } from '../index.ts'
import { listened } from './probe.ts'
import { closing, copyOf } from './projects.ts'

/** How often the work of each definition was carried out, as the test counts what the project tells it. */
function counts(t: TestContext): Map<string, number> {
  const made = new Map<string, number>()
  listened(t, 'tentjs.test.remembers', (told) => {
    const name = String(told)
    const n = (made.get(name) ?? 0) + 1
    made.set(name, n)
    return n
  })
  return made
}

/** The app of the project of remembered answers, with two callers who are signed in, and what changes its code. */
async function remembers(t: TestContext) {
  const folder = copyOf(t, 'remembers')
  const app = await testApp({ folder })
  closing(t, () => app.close())
  const ada = { as: await app.user({ name: 'Ada' }) }
  const bo = { as: await app.user({ name: 'Bo' }) }
  let n = 0
  /** Changes a file of the project, builds it, and has the app run the new version. */
  const changed = async (file: string, from: string, to: string): Promise<void> => {
    const path = join(folder, file)
    const text = readFileSync(path, 'utf8')
    assert.ok(text.includes(from), `${file} holds ${from}`)
    writeFileSync(path, text.replace(from, to))
    n += 1
    const built = await buildProject(folder, { for: 'dev', out: join(folder, '..', `bundle-${n}`) })
    assert.deepEqual(
      built.findings.filter((one) => one.level === 'error').map((one) => one.message),
      [],
    )
    await app.switch(await app.add(built.bundleFolder))
  }
  return { app, ada, bo, changed, seen: counts(t) }
}

test('[51-6] after its code changed the work is carried out, also where only a module that it imports changed, and with version stated it is not until that changes', async (t) => {
  const { app, ada, changed, seen } = await remembers(t)
  assert.equal(await app.call('worded', { n: 1 }, ada), 'the number 1')
  assert.equal(await app.call('worded', { n: 1 }, ada), 'the number 1')
  await app.call('versioned', { n: 1 }, ada)
  assert.deepEqual([seen.get('worded'), seen.get('versioned')], [1, 1])
  await changed('helpers/words.ts', '`the number ', '`again the number ')
  assert.equal(await app.call('worded', { n: 1 }, ada), 'again the number 1')
  assert.equal(seen.get('worded'), 2, 'a change of a module it imports made the work be carried out anew')
  assert.equal(await app.call('versioned', { n: 1 }, ada), 'the number 1')
  assert.equal(seen.get('versioned'), 1, 'with version stated, no other change makes the answer old')
  await changed('functions/answers.ts', "remember: { version: '1' },\n  input", "remember: { version: '2' },\n  input")
  assert.equal(await app.call('versioned', { n: 1 }, ada), 'again the number 1')
  assert.equal(seen.get('versioned'), 2)
})

test('[51-6] with kind an answer of one kind of worker is not given on another', async (t) => {
  const { app, ada, changed, seen } = await remembers(t)
  await app.call('kinded', { n: 1 }, ada)
  await app.call('kinded', { n: 1 }, ada)
  assert.equal(seen.get('kinded'), 1)
  await changed('functions/answers.ts', "worker: 'gpu',", "worker: 'cpu',")
  await app.call('kinded', { n: 1 }, ada)
  assert.equal(seen.get('kinded'), 2, 'the answer of gpu was given on cpu')
})

test('[51-6] a failure is not remembered, and past for an answer is gone', async (t) => {
  const { app, ada, seen } = await remembers(t)
  const first = await app.call('failsOnce', { n: 4 }, ada).catch((error: unknown) => error)
  assert.ok(first instanceof TentError || first instanceof Error)
  assert.equal(await app.call('failsOnce', { n: 4 }, ada), 4)
  assert.equal(await app.call('failsOnce', { n: 4 }, ada), 4)
  assert.equal(seen.get('failsOnce'), 2, 'the failure was remembered, or the answer was not')
  await app.call('brief', { n: 1 }, ada)
  await app.call('brief', { n: 1 }, ada)
  assert.equal(seen.get('brief'), 1)
  app.clock.advance('2 hours')
  await app.call('brief', { n: 1 }, ada)
  assert.equal(seen.get('brief'), 2, 'an answer past its for was given')
})

test('[51-6] past limits.remembered the answer that was given longest ago is gone', async (t) => {
  const { app, ada, seen } = await remembers(t)
  await app.call('long', { n: 1 }, ada)
  await app.call('long', { n: 2 }, ada)
  app.clock.advance('1 second')
  // The first is given again, and so the second is the one given longest ago when a third makes the room too small.
  await app.call('long', { n: 1 }, ada)
  app.clock.advance('1 second')
  await app.call('long', { n: 3 }, ada)
  await app.call('long', { n: 1 }, ada)
  await app.call('long', { n: 2 }, ada)
  assert.deepEqual([seen.get('long 1'), seen.get('long 2'), seen.get('long 3')], [1, 2, 1])
})

test('[51-6] a file in a remembered answer is given as a loose file of the caller own, over the same bytes', async (t) => {
  const { app, ada, bo, seen } = await remembers(t)
  const mine = String(await app.call('made', { n: 1 }, ada))
  const theirs = String(await app.call('made', { n: 1 }, bo))
  assert.equal(seen.get('made'), 1, 'the shared answer was given')
  assert.notEqual(theirs, mine, 'the file of one caller was handed to another')
  assert.equal(await app.call('textOf', { id: theirs }, bo), 'the bytes of 1', 'the copy holds the same bytes')
})
