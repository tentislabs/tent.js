import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { list, number, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import { createEngine } from '../../engine/index.ts'
import { copied, typed } from './typed.ts'

const system = { kind: 'system' } as const

/** The stored shape of a key as `tent access key list` prints it with `--json`: never the key itself. */
const listed = object({
  id: text(),
  name: text(),
  scopes: list(text()),
  roles: list(text()),
  user: text({ optional: true }),
  perMinute: number(),
  asks: text({ optional: true }),
  createdAt: text(),
  lastUsedAt: text({ optional: true }),
  expiresAt: text({ optional: true }),
})

test('[15-6@8a] [24-9] `tent access key add` shows a key once, `list` shows each key without it, and `remove` removes one, on an engine that runs, each with its stored shape', async (t) => {
  const project = copied(t, 'key-running')
  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(built.findings, [])
  const engine = createEngine({ port: 0 })
  try {
    const app = await engine.open(built.bundleFolder, { dataFolder: join(project, '.tent'), mode: 'test' })
    const ada = String(Object(await app.call('addUser', { name: 'Ada', roles: [] }, { as: system })).id)
    const words = ['access', 'key', 'add', 'reports', '--scopes', 'monthlyTotals,openOrders', '--roles', 'staff']
    const added = await typed(project, ...words, '--per-minute', '120', '--for', '90 days', '--json')
    assert.equal(added.ended, 0, added.printed)
    const made = Object(added.answer.value)
    assert.match(String(made.key), /^tent_[0-9a-z]{26}_[A-Za-z0-9_-]{43}$/)
    assert.equal(String(made.key).split('_')[1], made.id)
    const mine = await typed(
      project,
      'access',
      'key',
      'add',
      'maya-laptop',
      '--user',
      ada,
      '--scopes',
      '*',
      '--asks',
      'none',
      '--json',
    )
    assert.equal(mine.ended, 0, mine.printed)
    const all = await typed(project, 'access', 'key', 'list', '--json')
    assert.equal(all.ended, 0, all.printed)
    const keys: Record<string, unknown>[] = Object(all.answer.value)
    assert.equal(keys.length, 2)
    for (const one of keys) assert.deepEqual(checkValue(listed, one), [], JSON.stringify(one))
    assert.equal(all.printed.includes(String(made.key).slice(-43)), false, 'a list shows no key')
    const reports = keys.find((one) => one.name === 'reports')
    assert.deepEqual(
      [reports?.scopes, reports?.roles, reports?.perMinute],
      [['monthlyTotals', 'openOrders'], ['staff'], 120],
    )
    assert.ok(Date.parse(String(reports?.expiresAt)) - Date.now() > 89 * 86_400_000)
    const laptop = keys.find((one) => one.name === 'maya-laptop')
    assert.deepEqual([laptop?.user, laptop?.scopes, laptop?.asks, laptop?.perMinute], [ada, ['*'], 'none', 600])
    const removed = await typed(project, 'access', 'key', 'remove', String(made.id), '--json')
    assert.equal(removed.ended, 0, removed.printed)
    const left: Record<string, unknown>[] = Object(
      (await typed(project, 'access', 'key', 'list', '--json')).answer.value,
    )
    assert.deepEqual(
      left.map((one) => one.name),
      ['maya-laptop'],
    )
    // A key made for a user takes no roles of its own.
    const both = await typed(project, 'access', 'key', 'add', 'odd', '--user', ada, '--roles', 'staff', '--json')
    assert.equal(both.ended, 1, both.printed)
  } finally {
    await engine.close()
  }
})
