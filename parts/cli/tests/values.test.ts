import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { boolean, list, number, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import { createEngine, readSecrets } from '../../engine/index.ts'
import type { Typed } from './typed.ts'
import { copied, shell, typed } from './typed.ts'

const system = { kind: 'system' } as const

// A value that a test sets: long enough to be looked for, and found nowhere by chance.
const payKey = 'sk-test-9e1b7c4a2f6d8053'

/** Carries a command out as a program of its own, with what its input holds, as a script hands a value in. */
function withInput(cwd: string, input: string, ...words: string[]): Typed {
  return withKey(undefined, cwd, input, ...words)
}

/** The same, with the key of the secrets given by its variable, as on a server. */
function withKey(key: string | undefined, cwd: string, input: string, ...words: string[]): Typed {
  // The runner carries out no file for a program that it finds this in, and no key of a shell reaches the test.
  const { NODE_TEST_CONTEXT: _, TENT_SECRET_KEY: __, ...rest } = process.env
  const env = key === undefined ? rest : { ...rest, TENT_SECRET_KEY: key }
  const ended = spawnSync(process.execPath, [shell, ...words], { cwd, input, encoding: 'utf8', timeout: 120_000, env })
  let answer: Typed['answer'] = {}
  try {
    answer = Object(JSON.parse(ended.stdout))
  } catch {
    // What is printed as text is read by the test as text.
  }
  return { ended: ended.status ?? -1, printed: ended.stdout + ended.stderr, answer }
}

const findings = list(object({}))

test('[15-6@7a] with no engine running `tent secrets set` reads the value from its input, makes the key file and writes the file of test data, and with --live that of live data; `list`, `remove` and `key` print their stored shapes', async (t) => {
  const project = copied(t, 'secrets-none', 'valued')
  const data = join(project, '.tent')
  const set = withInput(project, `${payKey}\n`, 'secrets', 'set', 'PAY_KEY', '--json')
  assert.equal(set.ended, 0, set.printed)
  assert.deepEqual(
    checkValue(object({ ok: boolean(), value: object({ name: text(), set: boolean() }), findings }), set.answer),
    [],
  )
  assert.deepEqual(set.answer.value, { name: 'PAY_KEY', set: true })
  // The value is printed nowhere, the key file was made, and only the file of test data was written.
  assert.equal(set.printed.includes(payKey), false)
  assert.match(readFileSync(join(data, 'secret.key'), 'utf8'), /^[A-Za-z0-9+/]{43}=\n$/)
  assert.equal(readFileSync(join(data, 'secrets.test'), 'utf8').includes(payKey), false)
  assert.equal(existsSync(join(data, 'secrets.live')), false)
  assert.deepEqual(readSecrets(data), [payKey])
  // No engine was left running.
  assert.equal(existsSync(join(data, 'engine.json')), false)

  const live = withInput(project, 'the-live-value-of-the-key', 'secrets', 'set', 'PAY_KEY', '--live', '--json')
  assert.equal(live.ended, 0, live.printed)
  assert.deepEqual(readSecrets(data).sort(), [payKey, 'the-live-value-of-the-key'].sort())

  // The list shows the names that are set, and those that a definition names and that are not, and never a value.
  const listed = await typed(project, 'secrets', 'list', '--json')
  assert.equal(listed.ended, 0, listed.printed)
  const shape = object({ ok: boolean(), value: object({ set: list(text()), missing: list(text()) }), findings })
  assert.deepEqual(checkValue(shape, listed.answer), [], listed.printed)
  assert.deepEqual(listed.answer.value, { set: ['PAY_KEY'], missing: ['MAIL_SERVER'] })
  assert.equal(listed.printed.includes(payKey), false)
  const asText = await typed(project, 'secrets', 'list')
  assert.match(asText.printed, /PAY_KEY/)
  assert.match(asText.printed, /MAIL_SERVER/)

  const removed = await typed(project, 'secrets', 'remove', 'PAY_KEY', '--json')
  assert.deepEqual(removed.answer.value, { name: 'PAY_KEY', set: false })
  assert.deepEqual(readSecrets(data), ['the-live-value-of-the-key'])
  assert.deepEqual(Object((await typed(project, 'secrets', 'list', '--live', '--json')).answer.value).set, ['PAY_KEY'])

  // `tent secrets key` prints a new key, another each time, and keeps nothing.
  const [one, two] = [
    await typed(project, 'secrets', 'key', '--json'),
    await typed(project, 'secrets', 'key', '--json'),
  ]
  assert.deepEqual(
    checkValue(
      object({ ok: boolean(), value: object({ key: text({ pattern: '^[A-Za-z0-9+/]{43}=$' }) }), findings }),
      one.answer,
    ),
    [],
  )
  assert.notEqual(Object(one.answer.value).key, Object(two.answer.value).key)
  assert.notEqual(`${Object(one.answer.value).key}\n`, readFileSync(join(data, 'secret.key'), 'utf8'))

  // An empty value is no value.
  const empty = withInput(project, '', 'secrets', 'set', 'PAY_KEY', '--json')
  assert.equal(empty.ended, 1, empty.printed)
  assert.deepEqual(
    empty.answer.findings?.map((one) => one.code),
    ['T0002'],
  )
})

test('[15-6@7a] with an engine running `tent secrets set` and `tent settings set` hand the value to it, and the next call uses it; `tent settings` prints its stored shapes and refuses a value that does not fit', async (t) => {
  const project = copied(t, 'values-running', 'valued')
  const data = join(project, '.tent')
  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(built.findings, [])
  const engine = createEngine({ port: 0 })
  try {
    const app = await engine.open(built.bundleFolder, { dataFolder: data, mode: 'test' })
    // The engine has no key at hand, and makes none: the command makes the key file, and the engine reads it.
    const set = withInput(project, payKey, 'secrets', 'set', 'PAY_KEY', '--json')
    assert.equal(set.ended, 0, set.printed)
    assert.deepEqual(set.answer.value, { name: 'PAY_KEY', set: true })
    assert.equal(existsSync(join(data, 'secret.key')), true)
    assert.equal(await app.call('lengthOfKey', {}, { as: system }), payKey.length)

    const named = await typed(project, 'settings', 'set', 'shopName', 'The other shop', '--json')
    assert.equal(named.ended, 0, named.printed)
    const one = object({ ok: boolean(), value: object({ name: text(), set: boolean(), value: text() }), findings })
    assert.deepEqual(checkValue(one, named.answer), [], named.printed)
    await typed(project, 'settings', 'set', 'maxItems', '12')
    assert.deepEqual(await app.call('shown', {}, { as: system }), { shopName: 'The other shop', maxItems: 12 })
    // A public setting that is set reaches the page of the next request.
    const page = await app.page('/', { as: system })
    assert.match(page.html, /The other shop/)

    const refused = await typed(project, 'settings', 'set', 'maxItems', 'many', '--json')
    assert.equal(refused.ended, 1)
    assert.deepEqual(
      refused.answer.findings?.map((found) => found.code),
      ['T0002'],
    )

    const listed = await typed(project, 'settings', 'list', '--json')
    assert.deepEqual(Object(listed.answer.value).settings, [
      { name: 'maxItems', value: 12, set: true, public: false },
      { name: 'shopName', value: 'The other shop', set: true, public: true },
    ])
    const removed = await typed(project, 'settings', 'remove', 'shopName', '--json')
    assert.deepEqual(removed.answer.value, { name: 'shopName', set: false, value: 'The shop' })
    assert.equal(Object(await app.call('shown', {}, { as: system })).shopName, 'The shop')
  } finally {
    await engine.close()
  }
})

test('[22-5] [15-1@7a] `tent build` hands its guard the secrets of the data folder: a secret value in a file that a screen imports is T3007, and a secrets file that this computer cannot open is the note T3011', async (t) => {
  const project = copied(t, 'values-guard', 'valued')
  const data = join(project, '.tent')
  assert.equal(withInput(project, payKey, 'secrets', 'set', 'PAY_KEY', '--json').ended, 0)
  // With the value in no file of the project, the build passes, and says nothing of the secrets.
  const clean = await typed(project, 'build', '--json')
  assert.equal(clean.ended, 0, clean.printed)
  assert.deepEqual(clean.answer.findings, [])
  // The value is written into a file that the screen imports: no browser file may hold it.
  const words = join(project, 'words.ts')
  writeFileSync(words, readFileSync(words, 'utf8').replace('Welcome to the shop', `Welcome, the key is ${payKey}`))
  const leaked = await typed(project, 'build', '--json')
  assert.equal(leaked.ended, 1, leaked.printed)
  assert.deepEqual([...new Set(leaked.answer.findings?.map((one) => one.code))], ['T3007'])
  assert.equal(leaked.printed.includes(payKey), false)
  // `tent dev` and a command that builds for an engine of its own look for the value the same way.
  const viaCommand = await typed(project, 'access', '--json')
  assert.deepEqual([...new Set(viaCommand.answer.findings?.map((one) => one.code))], ['T3007'])

  // With another key in the place of the key, the file cannot be opened: the guard searched for nothing, and says so.
  const key = join(data, 'secret.key')
  const held = readFileSync(key, 'utf8')
  writeFileSync(key, `${Buffer.alloc(32, 7).toString('base64')}\n`)
  const closed = await typed(project, 'build', '--json')
  assert.equal(closed.ended, 0, closed.printed)
  assert.deepEqual(
    closed.answer.findings?.map((one) => [one.code, one.level]),
    [['T3011', 'note']],
  )
  assert.match(closed.answer.findings?.[0].message ?? '', /secrets\.test/)
  assert.match(closed.answer.findings?.[0].fix ?? '', /TENT_SECRET_KEY/)
  writeFileSync(key, held)
})

test('[22-18] with no engine running and a secrets file that the key at hand does not open, `tent secrets set` writes nothing, makes no key, and names TENT_SECRET_KEY', async (t) => {
  const project = copied(t, 'secrets-closed', 'valued')
  const data = join(project, '.tent')
  assert.equal(withInput(project, payKey, 'secrets', 'set', 'PAY_KEY', '--json').ended, 0)
  const before = readFileSync(join(data, 'secrets.test'), 'utf8')
  // Another key lies in the place of the key.
  const key = join(data, 'secret.key')
  const other = `${Buffer.alloc(32, 9).toString('base64')}\n`
  writeFileSync(key, other)
  const refused = withInput(project, 'another-value-for-a-key', 'secrets', 'set', 'OTHER_KEY', '--json')
  assert.equal(refused.ended, 1, refused.printed)
  assert.deepEqual(
    refused.answer.findings?.map((one) => one.code),
    ['T0019'],
  )
  assert.match(`${refused.answer.findings?.[0].message} ${refused.answer.findings?.[0].fix}`, /TENT_SECRET_KEY/)
  assert.equal(readFileSync(join(data, 'secrets.test'), 'utf8'), before)
  assert.equal(readFileSync(key, 'utf8'), other)
  // With no key at hand at all, and a secrets file there, no key is made: it would open nothing of the file.
  const { rmSync } = await import('node:fs')
  rmSync(key)
  const keyless = withInput(project, 'another-value-for-a-key', 'secrets', 'set', 'OTHER_KEY', '--json')
  assert.equal(keyless.ended, 1, keyless.printed)
  assert.deepEqual(
    keyless.answer.findings?.map((one) => one.code),
    ['T0019'],
  )
  assert.match(`${keyless.answer.findings?.[0].message} ${keyless.answer.findings?.[0].fix}`, /TENT_SECRET_KEY/)
  assert.equal(existsSync(key), false)
  assert.equal(readFileSync(join(data, 'secrets.test'), 'utf8'), before)
})

test('[15-6@7a] [22-14a] `tent secrets key --replace` makes a new key and prints its stored shape; where the key is a variable it prints the new key, waits for a yes that it was kept, and seals nothing without one', async (t) => {
  const project = copied(t, 'secrets-replace', 'valued')
  const data = join(project, '.tent')
  assert.equal(withInput(project, payKey, 'secrets', 'set', 'PAY_KEY', '--json').ended, 0)
  const first = readFileSync(join(data, 'secret.key'), 'utf8')
  const replaced = await typed(project, 'secrets', 'key', '--replace', '--json')
  assert.equal(replaced.ended, 0, replaced.printed)
  const shape = object({
    ok: boolean(),
    value: object({ role: text(), sealed: number(), secrets: number(), key: text({ optional: true }) }),
    findings,
  })
  assert.deepEqual(checkValue(shape, replaced.answer), [], replaced.printed)
  assert.deepEqual(replaced.answer.value, { role: 'writer', sealed: 0, secrets: 1 })
  const second = readFileSync(join(data, 'secret.key'), 'utf8')
  assert.notEqual(second, first)
  assert.deepEqual(readSecrets(data), [payKey])

  // On a server the key is a variable: the folder holds no key file.
  rmSync(join(data, 'secret.key'))
  const given = second.trim()
  // Without a yes that the new key was kept, nothing is sealed under it, and the old key still opens everything.
  const unkept = withKey(given, project, 'no', 'secrets', 'key', '--replace', '--json')
  assert.equal(unkept.ended, 1, unkept.printed)
  assert.deepEqual(
    unkept.answer.findings?.map((one) => one.code),
    ['T0013'],
  )
  assert.equal(existsSync(join(data, 'secret.key.next')), false)
  assert.equal(withKey(given, project, '', 'secrets', 'list', '--json').ended, 0)
  // With a yes, the new key is printed for whoever runs the engine, and no key file is made.
  const kept = withKey(given, project, 'yes', 'secrets', 'key', '--replace', '--json')
  assert.equal(kept.ended, 0, kept.printed)
  const printed = String(Object(kept.answer.value).key)
  assert.match(printed, /^[A-Za-z0-9+/]{43}=$/)
  assert.notEqual(printed, given)
  assert.equal(kept.printed.includes(printed), true)
  assert.equal(existsSync(join(data, 'secret.key')), false)
  assert.equal(existsSync(join(data, 'secret.key.next')), false)
  // From then on the secrets open under the new key, and no longer under the old one.
  writeFileSync(join(data, 'secret.key'), `${printed}\n`)
  assert.deepEqual(readSecrets(data), [payKey])
  writeFileSync(join(data, 'secret.key'), `${given}\n`)
  assert.deepEqual(readSecrets(data), [])
})
