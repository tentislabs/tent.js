import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { boolean, list, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import type { App } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { copied, typed } from './typed.ts'

const system = { kind: 'system' } as const

/** The stored shape of what `tent access role add` and `tent access role remove` print with `--json`. */
const shape = object({
  ok: boolean(),
  value: object({ user: text(), roles: list(text()) }),
  findings: list(object({})),
})

/** The roles that the row of a user holds now. */
async function rolesOf(app: App, id: string): Promise<unknown> {
  const row = await app.read({ from: 'users', one: 'get', id }, { as: system })
  return Reflect.get(Object(row), 'roles')
}

test('[15-6@7a] [22-11] `tent access role add` gives a user a role and `tent access role remove` takes it away, on an engine that runs, and each prints its stored shape with --json', async (t) => {
  const project = copied(t, 'role-running')
  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(built.findings, [])
  const engine = createEngine({ port: 0 })
  try {
    const app = await engine.open(built.bundleFolder, { dataFolder: join(project, '.tent'), mode: 'test' })
    const ada = String(Object(await app.call('addUser', { name: 'Ada', roles: [] }, { as: system })).id)

    const added = await typed(project, 'access', 'role', 'add', ada, 'staff', '--json')
    assert.equal(added.ended, 0, added.printed)
    assert.deepEqual(checkValue(shape, added.answer), [], added.printed)
    assert.deepEqual(added.answer.value, { user: ada, roles: ['staff'] })
    assert.deepEqual(await rolesOf(app, ada), ['staff'])
    // A role that the user has is not given twice, and a second one stands beside the first.
    await typed(project, 'access', 'role', 'add', ada, 'staff', '--json')
    const second = await typed(project, 'access', 'role', 'add', ada, 'editor', '--json')
    assert.deepEqual(second.answer.value, { user: ada, roles: ['staff', 'editor'] })

    const removed = await typed(project, 'access', 'role', 'remove', ada, 'staff', '--json')
    assert.equal(removed.ended, 0, removed.printed)
    assert.deepEqual(checkValue(shape, removed.answer), [], removed.printed)
    assert.deepEqual(removed.answer.value, { user: ada, roles: ['editor'] })
    assert.deepEqual(await rolesOf(app, ada), ['editor'])

    // As text, the roles of the user stand on a line of their own.
    const asText = await typed(project, 'access', 'role', 'add', ada, 'staff')
    assert.equal(asText.ended, 0)
    assert.match(asText.printed, /editor/)
    assert.match(asText.printed, /staff/)

    // The id of no user is T2103, a word that is neither `add` nor `remove` is refused, and nothing is written.
    const none = await typed(project, 'access', 'role', 'add', 'nobody-of-that-id', 'staff', '--json')
    assert.equal(none.ended, 1)
    assert.deepEqual(
      none.answer.findings?.map((one) => one.code),
      ['T2103'],
    )
    const odd = await typed(project, 'access', 'role', 'give', ada, 'staff', '--json')
    assert.notEqual(odd.ended, 0)
    assert.deepEqual(await rolesOf(app, ada), ['editor', 'staff'])

    // `tent access` itself is typed as before, and prints its table.
    const table = await typed(project, 'access', '--json')
    assert.equal(table.ended, 0, table.printed)
    assert.ok(Array.isArray(Object(table.answer.value).tables))
  } finally {
    await engine.close()
  }
})

test('[15-6@7a] with no engine running `tent access role add` starts one for the length of the command, on the development data, and leaves nothing running', async (t) => {
  const project = copied(t, 'role-none')
  const none = await typed(project, 'access', 'role', 'add', 'nobody-of-that-id', 'staff', '--json')
  assert.equal(none.ended, 1, none.printed)
  assert.deepEqual(
    none.answer.findings?.map((one) => one.code),
    ['T2103'],
  )
  assert.equal(existsSync(join(project, '.tent', 'engine.json')), false)
})
