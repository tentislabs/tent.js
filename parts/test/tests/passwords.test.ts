import assert from 'node:assert/strict'
import { argon2Sync, randomBytes } from 'node:crypto'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

const opened = async (t: test.TestContext): Promise<TestApp> => {
  const app = await testApp({ folder: copyOf(t, 'guarded') })
  closing(t, () => app.close())
  return app
}

/** The standard base64 with no filling, as the text form of a stored password writes its two parts. */
const bare = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64').replace(/=+$/, '')

/** A stored text made by hand with the method itself, under the settings that are handed. */
function storedWith(password: string, memory: number, passes: number, parallelism: number): string {
  const salt = randomBytes(16)
  const hash = argon2Sync('argon2id', { message: password, nonce: salt, parallelism, tagLength: 32, memory, passes })
  return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${bare(salt)}$${bare(hash)}`
}

test('[22-9] a stored password has the standard text form of Argon2id with the settings of the engine, checks true for its password and false for another, and one made with other settings is old', async (t) => {
  const app = await opened(t)
  const system = app.as('system')
  await system.call('signUp', { email: 'ada@example.com', password: 'correct horse battery' })
  const ada = (await app.rows('users')).find((one) => one.email === 'ada@example.com')
  const stored = String(ada?.password)
  // The text names its method and its settings: 19 MiB of memory, 2 passes, one lane, a salt of 16 bytes, a result of 32.
  const form = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/.exec(stored)
  assert.ok(form, stored)
  assert.equal(Buffer.from(form[1], 'base64').length, 16)
  assert.equal(Buffer.from(form[2], 'base64').length, 32)
  // The method is the standard one: the same password, salt and settings give the stored result outside the engine.
  const again = argon2Sync('argon2id', {
    message: 'correct horse battery',
    nonce: Buffer.from(form[1], 'base64'),
    parallelism: 1,
    tagLength: 32,
    memory: 19456,
    passes: 2,
  })
  assert.equal(bare(again), form[2])

  assert.equal(await system.call('checks', { password: 'correct horse battery', stored }), true)
  assert.equal(await system.call('checks', { password: 'correct horse batterz', stored }), false)
  assert.equal(await system.call('checks', { password: '', stored }), false)
  assert.equal(await system.call('isOld', { stored }), false)
  // The same password hashed twice gives two texts, since each has a salt of its own, and both check.
  await system.call('signUp', { email: 'bob@example.com', password: 'correct horse battery' })
  const other = String((await app.rows('users')).find((one) => one.email === 'bob@example.com')?.password)
  assert.notEqual(other, stored)
  assert.equal(await system.call('checks', { password: 'correct horse battery', stored: other }), true)

  // A text made with other settings still checks, by the settings that it names, and is old.
  for (const [memory, passes, lanes] of [
    [8192, 2, 1],
    [19456, 3, 1],
    [19456, 2, 2],
  ]) {
    const older = storedWith('an older password', memory, passes, lanes)
    assert.equal(await system.call('checks', { password: 'an older password', stored: older }), true, older)
    assert.equal(await system.call('checks', { password: 'another password', stored: older }), false, older)
    assert.equal(await system.call('isOld', { stored: older }), true, older)
  }
  // A text that is no stored password checks false for every password, and is old: a sign-in stores a new one.
  for (const none of [
    '',
    'plain text',
    '$argon2i$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$AAAA',
    '$2b$10$abcdefghijk',
  ]) {
    assert.equal(await system.call('checks', { password: 'plain text', stored: none }), false, none)
    assert.equal(await system.call('isOld', { stored: none }), true, none)
  }
})

test('[22-9] a sign-in written with passwords.check signs the right password in and no other, and hash is refused in a change with T0013', async (t) => {
  const app = await opened(t)
  await app.as('system').call('signUp', { email: 'ada@example.com', password: 'correct horse battery' })
  const browser = app.browser()
  assert.deepEqual(await browser.call('signIn', { email: 'ada@example.com', password: 'wrong' }), {
    ok: true,
    value: false,
  })
  assert.deepEqual(await browser.call('signIn', { email: 'nobody@example.com', password: 'correct horse battery' }), {
    ok: true,
    value: false,
  })
  assert.deepEqual(await browser.call('signIn', { email: 'ada@example.com', password: 'correct horse battery' }), {
    ok: true,
    value: true,
    caller: 'changed',
  })
  const ada = String((await app.rows('users')).find((one) => one.email === 'ada@example.com')?.id)
  assert.deepEqual(await browser.call('whoAmI'), { ok: true, value: [ada] })
  // A change waits for nothing, so a member of the handle that answers a promise is refused there.
  await assert.rejects(app.as('system').call('hashInWrite', { password: 'x' }), { code: 'T0013' })
})
