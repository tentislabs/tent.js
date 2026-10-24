import assert from 'node:assert/strict'
import { cpSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { boolean, json, list, number, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import { servedApp } from './served.ts'
import { typed } from './typed.ts'

/** What a command prints with `--json`, which must end with 0 and fit its shape. */
async function shaped(
  folder: string,
  shape: Parameters<typeof checkValue>[0],
  ...words: string[]
): Promise<Record<string, unknown>> {
  const answered = await typed(folder, ...words, '--json')
  assert.equal(answered.ended, 0, answered.printed)
  assert.deepEqual(checkValue(shape, answered.answer.value), [], `${words.join(' ')}: ${answered.printed}`)
  return Object(answered.answer.value)
}

const anything = json({ optional: true })

test('[15-6@8c] tent access key --right, login, push, pull, publish, the far settings, and history branch and merge print their stored shapes with --json', async (t) => {
  const server = await servedApp(t, 'publish-command')
  const made = await shaped(
    server.project,
    object({
      id: text(),
      name: text(),
      key: text(),
      scopes: list(text()),
      roles: list(text()),
      perMinute: number(),
      createdAt: anything,
    }),
    'access',
    'key',
    'add',
    'deploy',
    '--right',
    'publish',
    '--data',
    server.data,
  )
  process.env.TENT_KEY = String(made.key)
  process.env.TENT_AT = server.address
  const here = join(server.project, '..', 'here')
  cpSync(join(import.meta.dirname, 'merging'), here, { recursive: true })
  const at = ['--insecure', '127.0.0.1']
  await shaped(here, object({ server: text(), name: text(), mode: text() }), 'login', server.address, ...at)
  assert.equal((await typed(here, 'history', 'save', 'first', '--json')).ended, 0)
  await shaped(
    here,
    object({ points: number(), blobs: number(), to: text(), branch: text() }),
    'push',
    '--to',
    'live',
    ...at,
  )
  const published = object({
    version: text(),
    point: text(),
    hard: boolean(),
    opens: boolean(),
    breaks: list(anything),
    findings: list(anything),
    impact: anything,
    published: boolean(),
    to: text(),
    refused: text({ optional: true }),
    live: text({ optional: true }),
    behind: number({ optional: true }),
  })
  const tried = await shaped(here, published, 'publish', '--to', 'live', ...at)
  assert.equal(tried.published, false)
  const done = await shaped(here, published, 'publish', '--to', 'live', '--yes', ...at)
  assert.equal(done.published, true)
  assert.equal(server.app.versions().find((one) => one.running)?.id, done.version)
  await shaped(here, object({ settings: list(text()) }), 'settings', 'list', '--to', 'live', ...at)
  await shaped(
    here,
    object({
      changes: list(anything),
      lines: list(text()),
      clashes: list(anything),
      from: text(),
      point: anything,
      checked: boolean(),
      version: text(),
      findings: list(anything),
    }),
    'pull',
    '--to',
    'live',
    ...at,
  )
  await shaped(here, object({ on: text(), branches: json() }), 'history', 'branch')
  await shaped(
    here,
    object({ changes: list(anything), lines: list(text()), clashes: list(anything), merged: boolean() }),
    'history',
    'merge',
    'main',
  )
})
