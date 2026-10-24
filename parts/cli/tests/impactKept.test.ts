import assert from 'node:assert/strict'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { servedApp } from './served.ts'
import { typed } from './typed.ts'

test('[44-2] the impact of a publish is kept with its point, and tent history compare of two points prints it beside what changed', async (t) => {
  const server = await servedApp(t, 'impact-kept')
  const made = await typed(
    server.project,
    'access',
    'key',
    'add',
    'deploy',
    '--right',
    'publish',
    '--data',
    server.data,
    '--json',
  )
  assert.equal(made.ended, 0, made.printed)
  process.env.TENT_KEY = String(Object(made.answer.value).key)
  process.env.TENT_AT = server.address
  const here = join(server.project, '..', 'here')
  cpSync(join(import.meta.dirname, 'merging'), here, { recursive: true })
  const at = ['--to', 'live', '--insecure', '127.0.0.1']
  assert.equal((await typed(here, 'login', server.address, '--insecure', '127.0.0.1', '--json')).ended, 0)
  assert.equal((await typed(here, 'history', 'save', 'first', '--json')).ended, 0)
  assert.equal((await typed(here, 'publish', ...at, '--yes', '--json')).ended, 0)

  // A rule that is widened: anyone may now add an order. The publish lands once its impact is accepted.
  const file = join(here, 'functions', 'orders.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8')
      .replace(
        "export const addOrder = change('addOrder', {\n  access: 'signedIn',",
        "export const addOrder = change('addOrder', {\n  access: anyone('a test widens it'),",
      )
      .replace(
        "import { action, change, input, number, query, text } from 'tentjs'",
        "import { action, anyone, change, input, number, query, text } from 'tentjs'",
      ),
  )
  assert.equal((await typed(here, 'history', 'save', 'second', '--json')).ended, 0)
  // What the publish would do is printed as its impact, the one report: no list of breaks beside it.
  const tried = await typed(here, 'publish', ...at)
  assert.ok(tried.printed.includes('Impact against live'), tried.printed)
  assert.ok(!tried.printed.split('\n').some((line) => line.startsWith('breaks:')), tried.printed)
  const done = await typed(here, 'publish', ...at, '--yes', '--accept-impact', '--json')
  assert.equal(done.ended, 0, done.printed)
  const point = String(Object(done.answer.value).point)

  // What changed comes first, one change to a line, and the impact that the publish printed after it.
  const compared = await typed(here, 'history', 'compare', 'first', point)
  assert.equal(compared.ended, 0, compared.printed)
  const lines = compared.printed.split('\n')
  const changed = lines.findIndex((line) => line.includes('functions/orders.ts'))
  const impact = lines.findIndex((line) => line.startsWith('Impact against'))
  assert.ok(changed >= 0 && impact > changed, compared.printed)
  assert.ok(lines.includes('Wider rights'), compared.printed)
  assert.ok(
    lines.some((line) => line.startsWith('  addOrder (change, now callable by anyone)')),
    compared.printed,
  )
})
