import assert from 'node:assert/strict'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { servedApp } from './served.ts'
import { typed } from './typed.ts'

test('[40-8] tent access key with --right makes a key of publishing, tent login keeps it, tent push sends with no tent dev running, and tent pull brings it to another computer', async (t) => {
  const server = await servedApp(t, 'push-command')
  const made = await typed(
    server.project,
    'access',
    'key',
    'add',
    'deploy',
    '--right',
    'push',
    '--data',
    server.data,
    '--json',
  )
  assert.equal(made.ended, 0, made.printed)
  const key = String(Object(made.answer.value).key)
  process.env.TENT_KEY = key
  process.env.TENT_AT = server.address

  const here = join(server.project, '..', 'here')
  cpSync(join(import.meta.dirname, 'merging'), here, { recursive: true })
  const login = await typed(here, 'login', server.address, '--insecure', '127.0.0.1', '--json')
  assert.equal(login.ended, 0, login.printed)
  assert.deepEqual(Object(login.answer.value).name, 'live', 'the target is named by its mode')
  const kept = readFileSync(join(String(process.env.TENT_HOME), 'keys.json'), 'utf8')
  assert.ok(kept.includes(key), 'the key is kept under publish')

  assert.equal((await typed(here, 'history', 'save', 'first', '--json')).ended, 0)
  const pushed = await typed(here, 'push', '--to', 'live', '--insecure', '127.0.0.1', '--json')
  assert.equal(pushed.ended, 0, pushed.printed)
  assert.ok(Number(Object(pushed.answer.value).points) >= 1)
  const now = server.history.pointer('main')
  assert.ok(now, 'the branch of the server stands on the pushed point')
  assert.equal(server.history.read(String(now))?.name, 'first')

  // Another computer with a change of its own pulls, and the server's point is merged into its files.
  const there = join(server.project, '..', 'there')
  cpSync(join(import.meta.dirname, 'merging'), there, { recursive: true })
  assert.equal((await typed(there, 'login', server.address, '--insecure', '127.0.0.1', '--json')).ended, 0)
  writeFileSync(join(there, 'notes.md'), `${readFileSync(join(there, 'notes.md'), 'utf8')}6. Holidays it is closed.\n`)
  const pulled = await typed(there, 'pull', '--to', 'live', '--insecure', '127.0.0.1', '--json')
  assert.equal(pulled.ended, 0, pulled.printed)
  assert.ok(readFileSync(join(there, 'notes.md'), 'utf8').includes('Holidays'), 'its own change stays')
})
