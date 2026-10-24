import assert from 'node:assert/strict'
import { cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { openedCommands, ranLine, userOf } from './lineApp.ts'
import { copied } from './typed.ts'

test('[24-14] a command in code is handed the terminal and reads a line and a key; `call` and `read` reach the app as the caller; `write` prints a control code as its code and `raw` as it is; what `run` answers is how the command ends', async (t) => {
  const { app, data } = await openedCommands(t, { commands: true })
  const ada = await userOf(app, 'Ada')
  const done = await ranLine(app, data, ['desk', '--limit', '5', '--', 'and', 'more'], {
    as: ada,
    lines: ['typed'],
    keys: ['enter'],
  })
  assert.equal(done.ended, 3, done.err)
  assert.match(done.out, new RegExp(`who: ${ada} user: ${ada}`))
  assert.match(done.out, /key: enter/)
  assert.match(done.out, /notes: \["typed"\]/)
  assert.match(done.out, /rest: and more/)
  assert.match(done.out, /bell\\u0007/)
  assert.ok(done.out.includes(`<raw>raw${String.fromCharCode(7)}`), 'raw is written as it is')
  const notes = await app.read({ from: 'notes' }, { as: { kind: 'system' } })
  assert.deepEqual(
    (Array.isArray(notes) ? notes : []).map((one) => [Object(one).title, Object(one).by]),
    [['typed', ada]],
  )
  // A command is listed with its access, its module and its export.
  const help = await ranLine(app, data, ['--help'])
  assert.match(help.out, /desk\s+Walks through the notes at the desk/)
  assert.match(help.out, /watch-notes/)
})

test('[24-14] a list that a command watches is, after a `rows` message, the list a fresh answer gives', async (t) => {
  const { app, data } = await openedCommands(t, { commands: true })
  await app.call('addNote', { title: 'first' }, { as: { kind: 'system' } })
  const watched = await ranLine(app, data, ['watch-notes'])
  assert.equal(watched.ended, 0, watched.err)
  const seen: string[][] = JSON.parse(watched.out)
  assert.deepEqual(seen[0], ['first'])
  assert.deepEqual(seen.at(-1), await app.call('openNotes', { limit: 20 }, { as: { kind: 'system' } }))
})

test('[24-14] a caller whose access the command does not fit is refused before `run`', async (t) => {
  const { app, data } = await openedCommands(t, { commands: true })
  const ada = await userOf(app, 'Ada')
  const refused = await ranLine(app, data, ['close-desk'], { as: ada })
  assert.equal(refused.ended, 1)
  assert.equal(refused.out, '')
  assert.match(refused.err, /T3101/)
  const staff = await userOf(app, 'Sam', ['staff'])
  assert.equal((await ranLine(app, data, ['close-desk'], { as: staff })).out, 'closed\n')
  assert.equal((await ranLine(app, data, ['close-desk'])).out, 'closed\n', 'the system passes every access')
})

test('[24-14] the module of a command file holds neither a text of the backend file it imports nor a secret, and lies under `cli/`, named in the description', async (t) => {
  const project = copied(t, 'file-module', 'commanded')
  cpSync(join(import.meta.dirname, 'commandFiles'), join(project, 'commands'), { recursive: true })
  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const description = JSON.parse(readFileSync(join(built.bundleFolder, 'description.json'), 'utf8'))
  const files: string[] = description.cli.files
  assert.deepEqual(
    readdirSync(join(built.bundleFolder, 'cli'))
      .map((one) => `cli/${one}`)
      .sort(),
    [...files].sort(),
  )
  assert.equal(files.length, 1, 'one module for each command file')
  assert.equal(description.commands.desk.module, files[0])
  assert.equal(description.commands.desk.export, 'desk')
  assert.deepEqual(description.commands.closeDesk.access, { rule: 'role', role: 'staff' })
  const text = readFileSync(join(built.bundleFolder, files[0]), 'utf8')
  // The backend file reaches the module as the names of its definitions alone.
  for (const marker of ['Who calls', 'The shop is closed', 'a test reads the notes'])
    assert.equal(text.includes(marker), false, marker)
  assert.match(text, /from\s*["']tentjs\/cli["']/)
  // A secret that a command file holds is found by the guard of the build.
  const file = join(project, 'commands', 'notes.ts')
  writeFileSync(file, readFileSync(file, 'utf8').replace("'no line'", "'the-pay-key-of-the-shop'"))
  const guarded = await buildProject(project, { for: 'dev', secrets: ['the-pay-key-of-the-shop'] })
  assert.ok(
    guarded.findings.some((one) => one.level === 'error' && String(one.where?.file ?? one.message).includes('cli')),
    JSON.stringify(guarded.findings),
  )
})

test('[24-14] `follow`, and a call of an agent, from a command', async (t) => {
  // The engine is closed before its folder is removed: the hooks of a test run in the order they were given.
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const project = copied(t, 'assisted-command', 'commanded')
  // The agent, its provider and a command that follows it stand beside the project in a copy of it.
  cpSync(join(import.meta.dirname, 'assistedCommand'), project, { recursive: true })
  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const data = join(project, '.tent')
  const app = await engine.open(built.bundleFolder, { dataFolder: data, mode: 'test' })
  // An offered agent: the command line follows its run and prints its text as it is written.
  const offered = await ranLine(app, data, ['helper', '--message', 'Hi'])
  assert.equal(offered.ended, 0, offered.err)
  assert.equal(offered.out, 'You said Hi\n')
  // A command in code starts it with `call`, and follows the run with `follow`.
  const followed = await ranLine(app, data, ['ask'])
  assert.equal(followed.ended, 0, followed.err)
  assert.equal(followed.out, 'You said Hello\n')
})
