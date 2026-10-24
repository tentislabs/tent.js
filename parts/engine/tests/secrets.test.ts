import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { makeSecretKey, readSecrets, storedValues, unreadSecrets } from '../index.ts'
import type { Answered, Running } from './apps.ts'
import { codeOf, logRows, running, send, system } from './apps.ts'

/** Sends a command to the admin channel of an app, as a command of this computer does, with no network. */
function command(run: Running, name: string, args: object): Promise<Answered> {
  const token = String(JSON.parse(readFileSync(join(run.dataFolder, 'engine.json'), 'utf8')).token)
  return send(run.app, `${run.origin}/_t/admin/${name}`, {
    body: JSON.stringify({ args }),
    headers: { authorization: `Bearer ${token}` },
  })
}

/** What a secrets file holds, by the names of its values. */
const fileOf = (dataFolder: string, name: string): Record<string, string> =>
  JSON.parse(readFileSync(join(dataFolder, name), 'utf8')).values

/** Writes the values of a secrets file by hand, as somebody who moves a value from one place to another. */
const writeFile = (dataFolder: string, name: string, values: Record<string, string>): void =>
  writeFileSync(join(dataFolder, name), JSON.stringify({ format: 'tent.secrets/1', values }))

// A value that a test sets: long enough to be looked for, and found nowhere by chance.
const payKey = 'sk-test-4f9a1c7e2b8d6a30'

test('[22-14a] reveal() of a secret with no value is T0019, a value that is set while the engine runs is used by the next call, and the file holds no value as it is', async (t) => {
  const run = await running(t, { project: 'valued' })
  const { app, dataFolder } = run
  // With no value the use of the secret fails, and names the secret and the command that sets it.
  const none = await assert.rejects(
    app.call('lengthOfKey', {}, { as: system }),
    (error: { code: string; message: string; fix: string }) => {
      assert.equal(error.code, 'T0019')
      assert.match(error.message, /PAY_KEY/)
      assert.match(error.fix, /tent secrets set PAY_KEY/)
      return true
    },
  )
  assert.equal(none, undefined)
  // An engine makes no key: with none at hand a secret cannot be set, and T0019 names the key.
  const keyless = await command(run, 'secrets', { do: 'set', name: 'PAY_KEY', value: payKey })
  assert.deepEqual(keyless.body, { ok: true, value: { name: 'PAY_KEY', set: false, key: false } })
  assert.equal(existsSync(join(dataFolder, 'secrets.test')), false)
  assert.equal(existsSync(join(dataFolder, 'secret.key')), false)
  // The command makes the key file, where no key is given and no secrets file is there yet, and the engine reads it.
  assert.equal(makeSecretKey(dataFolder), true)
  assert.equal(makeSecretKey(dataFolder), false)
  assert.match(readFileSync(join(dataFolder, 'secret.key'), 'utf8'), /^[A-Za-z0-9+/]{43}=\n$/)
  const set = await command(run, 'secrets', { do: 'set', name: 'PAY_KEY', value: payKey })
  assert.deepEqual(set.body, { ok: true, value: { name: 'PAY_KEY', set: true } })
  // The very next call uses the value.
  assert.equal(await app.call('lengthOfKey', {}, { as: system }), payKey.length)
  // A second value takes its place at once.
  await command(run, 'secrets', { do: 'set', name: 'PAY_KEY', value: `${payKey}-longer` })
  assert.equal(await app.call('lengthOfKey', {}, { as: system }), payKey.length + 7)
  // The file holds the form of its kind and one text for the name, in which the value does not stand.
  const written = readFileSync(join(dataFolder, 'secrets.test'), 'utf8')
  assert.equal(JSON.parse(written).format, 'tent.secrets/1')
  assert.deepEqual(Object.keys(fileOf(dataFolder, 'secrets.test')), ['PAY_KEY'])
  assert.match(fileOf(dataFolder, 'secrets.test').PAY_KEY, /^[A-Za-z0-9_-]+$/)
  assert.equal(written.includes(payKey), false)
  assert.equal(written.includes(Buffer.from(payKey).toString('base64').slice(0, 16)), false)
  // A list answers the names that are set, and never a value.
  const listed = await command(run, 'secrets', { do: 'list' })
  assert.deepEqual(listed.body, { ok: true, value: { set: ['PAY_KEY'], missing: [] } })
  // A removal takes the value away, and the use fails again.
  assert.deepEqual((await command(run, 'secrets', { do: 'remove', name: 'PAY_KEY' })).body.ok, true)
  assert.equal(await codeOf(app.call('lengthOfKey', {}, { as: system })), 'T0019')
})

test('[22-14a] a value written twice gives two texts, and both open; a value copied from the test file into the live one, and one moved to another name, does not open', async (t) => {
  const run = await running(t, { project: 'valued' })
  const { app, dataFolder, bundle } = run
  makeSecretKey(dataFolder)
  await command(run, 'secrets', { do: 'set', name: 'PAY_KEY', value: payKey })
  const first = fileOf(dataFolder, 'secrets.test').PAY_KEY
  await command(run, 'secrets', { do: 'set', name: 'PAY_KEY', value: payKey })
  const second = fileOf(dataFolder, 'secrets.test').PAY_KEY
  // Each writing draws a start value of its own: the same value gives another text.
  assert.notEqual(first, second)
  assert.equal(first.length, second.length)
  // Both open: the first text put back by hand is read as the second is.
  for (const text of [first, second]) {
    writeFile(dataFolder, 'secrets.test', { PAY_KEY: text })
    assert.deepEqual(storedValues(dataFolder, bundle.description, { kind: 'secrets', list: true }), {
      set: ['PAY_KEY'],
      missing: [],
    })
    assert.deepEqual(readSecrets(dataFolder), [payKey])
  }
  // The same text under another name does not open, and the use of it is T0019.
  writeFile(dataFolder, 'secrets.test', { PAY_KEY: second, OTHER_KEY: second })
  assert.deepEqual(readSecrets(dataFolder), [])
  assert.deepEqual(unreadSecrets(dataFolder), ['secrets.test'])
  // Copied into the live file, it does not open there either: a value is bound to its mode.
  writeFile(dataFolder, 'secrets.test', { PAY_KEY: second })
  writeFile(dataFolder, 'secrets.live', { PAY_KEY: second })
  assert.deepEqual(readSecrets(dataFolder), [payKey])
  assert.deepEqual(unreadSecrets(dataFolder), ['secrets.live'])
  // A value that was changed by one character does not open.
  const changed = `${second.slice(0, 20)}${second[20] === 'A' ? 'B' : 'A'}${second.slice(21)}`
  writeFile(dataFolder, 'secrets.live', {})
  writeFile(dataFolder, 'secrets.test', { PAY_KEY: changed })
  assert.deepEqual(readSecrets(dataFolder), [])
  // Where the key at hand does not open the file, nothing is written: the file stands as it stood.
  const before = readFileSync(join(dataFolder, 'secrets.test'), 'utf8')
  assert.throws(
    () => storedValues(dataFolder, bundle.description, { kind: 'secrets', name: 'NEW_KEY', value: 'a new value' }),
    {
      code: 'T0019',
    },
  )
  assert.equal(readFileSync(join(dataFolder, 'secrets.test'), 'utf8'), before)
  assert.equal(await codeOf(app.call('lengthOfKey', {}, { as: system })), 'T0019')
})

test('[22-5] a secret that code did not reveal appears in no log and no answer, and one that code revealed and then put into an error message is [secret] in the log', async (t) => {
  const run = await running(t, { project: 'valued' })
  const { app, dataFolder, origin } = run
  makeSecretKey(dataFolder)
  await command(run, 'secrets', { do: 'set', name: 'PAY_KEY', value: payKey })
  // With no `reveal()` the secret reads `[secret]` wherever it is written out.
  assert.deepEqual(await app.call('asText', {}, { as: system }), ['[secret]', '[secret]', '{"key":"[secret]"}'])
  // In a query it cannot be opened at all.
  assert.equal(await codeOf(app.call('revealInQuery', {}, { as: system })), 'T0013')
  // The code opens it, writes it into the log three ways, and throws it in the message of an error.
  const failed = await send(app, `${origin}/_t/call/leaks`, { headers: { origin } })
  assert.deepEqual([failed.status, failed.error.code], [500, 'T0009'])
  const kept = JSON.stringify([
    logRows(dataFolder, 'lines'),
    logRows(dataFolder, 'errors'),
    logRows(dataFolder, 'calls'),
  ])
  assert.equal(kept.includes(payKey), false)
  assert.equal(kept.includes(encodeURIComponent(payKey)), false)
  assert.equal(kept.includes(Buffer.from(payKey).toString('base64')), false)
  const lines = logRows(dataFolder, 'lines').map((row) => String(row.message))
  assert.deepEqual(lines, ['the key is [secret]', 'in base64 it is [secret]'])
  const error = Object(logRows(dataFolder, 'errors').at(-1))
  assert.equal(error.message, 'the service refused the key [secret]')
  assert.equal(String(error.stack).includes('[secret]'), true)
  // The key of the secrets itself is in no log either, and the data file holds no value.
  const key = readFileSync(join(dataFolder, 'secret.key'), 'utf8').trim()
  assert.equal(kept.includes(key), false)
  // A value of fewer than eight characters is not looked for: it would be found inside ordinary words.
  await command(run, 'secrets', { do: 'set', name: 'PAY_KEY', value: 'short' })
  await send(app, `${origin}/_t/call/leaks`, { headers: { origin } })
  assert.equal(String(logRows(dataFolder, 'lines').at(-2)?.message), 'the key is short')
  // A secret whose value is an address: its user name and its password are taken out by themselves too.
  await command(run, 'secrets', {
    do: 'set',
    name: 'MAIL',
    value: 'smtps://mailer-user-91:pw-7c1e9a44b2@mail.example.com:465',
  })
  await send(app, `${origin}/_t/call/leaks`, { body: JSON.stringify({ input: { name: 'MAIL' } }), headers: { origin } })
  const again = JSON.stringify(logRows(dataFolder, 'lines'))
  assert.equal(again.includes('pw-7c1e9a44b2'), false)
  assert.equal(again.includes('mailer-user-91'), false)
})

test('[22-14a] a secret that the app sets itself is a secret of its own mode, in a function with full access alone', async (t) => {
  const run = await running(t, { project: 'valued' })
  const { app, dataFolder } = run
  makeSecretKey(dataFolder)
  await app.call('setKey', { name: 'PAY_KEY', value: payKey }, { as: system })
  assert.equal(await app.call('lengthOfKey', {}, { as: system }), payKey.length)
  assert.deepEqual(Object.keys(fileOf(dataFolder, 'secrets.test')), ['PAY_KEY'])
  assert.equal(existsSync(join(dataFolder, 'secrets.live')), false)
  // The value is in no log.
  assert.equal(JSON.stringify([logRows(dataFolder, 'lines'), logRows(dataFolder, 'calls')]).includes(payKey), false)
  await app.call('dropKey', { name: 'PAY_KEY' }, { as: system })
  assert.equal(await codeOf(app.call('lengthOfKey', {}, { as: system })), 'T0019')
  // A function that states no `system` may not set one, whoever calls it but the system.
  assert.equal(
    await codeOf(app.call('setKeyAsAnyone', { name: 'X', value: 'another value' }, { as: { kind: 'nobody' } })),
    'T0013',
  )
})

test('[21-16@7a] the mode says which files are read: development and test read the test files, and live the live ones', async (t) => {
  for (const [mode, read] of [
    ['development', 'test'],
    ['test', 'test'],
    ['live', 'live'],
  ] as const) {
    const run = await running(t, { project: 'valued', open: { mode } })
    const { app, dataFolder, bundle } = run
    makeSecretKey(dataFolder)
    // Each file holds a value of its own, written with no engine.
    await app.close()
    storedValues(dataFolder, bundle.description, { kind: 'secrets', name: 'PAY_KEY', value: 'the value of test' })
    storedValues(dataFolder, bundle.description, {
      kind: 'secrets',
      live: true,
      name: 'PAY_KEY',
      value: 'value of live',
    })
    storedValues(dataFolder, bundle.description, { kind: 'settings', name: 'shopName', value: 'Shop on test data' })
    storedValues(dataFolder, bundle.description, {
      kind: 'settings',
      live: true,
      name: 'shopName',
      value: 'Shop on live data',
    })
    const again = await run.engine.open(bundle.folder, { dataFolder, mode })
    assert.equal(await again.call('lengthOfKey', {}, { as: system }), read === 'test' ? 17 : 13, mode)
    assert.equal(Object(await again.call('shown', {}, { as: system })).shopName, `Shop on ${read} data`, mode)
    await again.close()
  }
})

test('[22-14a] a sealed column is stored encrypted under the key of the secrets, each value by itself, and is read back as it was written; with no key at hand it is T0019', async (t) => {
  const run = await running(t, { project: 'valued' })
  const { app, dataFolder } = run
  // With no key at hand a write of a sealed column fails, and names the column.
  assert.equal(
    await codeOf(app.call('keep', { title: 'first', note: 'the note of the first' }, { as: system })),
    'T0019',
  )
  makeSecretKey(dataFolder)
  // The key is looked for at the next call.
  await app.call('keep', { title: 'first', note: 'the note of the first', pin: 4711 }, { as: system })
  await app.call('keep', { title: 'second', note: 'the note of the first' }, { as: system })
  const rows = Object(await app.call('kept', {}, { as: system }))
  assert.deepEqual(
    rows.map((row: { title: string; note: string; pin?: number }) => [row.title, row.note, row.pin]),
    [
      ['first', 'the note of the first', 4711],
      ['second', 'the note of the first', undefined],
    ],
  )
  // The data file holds neither note as it is, and the same note under two rows is two texts.
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  const stored = data.prepare('SELECT title, note, pin FROM "vault" ORDER BY title').all()
  data.close()
  assert.equal(JSON.stringify(stored).includes('the note of the first'), false)
  assert.equal(JSON.stringify(stored).includes('4711'), false)
  assert.notEqual(stored[0].note, stored[1].note)
  assert.match(String(stored[0].note), /^[A-Za-z0-9_-]+$/)
})
