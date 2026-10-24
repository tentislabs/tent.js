import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { here, openedCommands, ranLine, runningVersion, userOf, valueOf } from './lineApp.ts'
import { copied, program } from './typed.ts'

const system = { kind: 'system' } as const

test('[24-13] each row of the table of flags reaches the function as its value: text, a link, a date, a day, a choice, a number, true or false, a list, JSON and a file', async (t) => {
  const { app, project, data } = await openedCommands(t)
  const ada = await userOf(app, 'Ada')
  const words = ['take-order', '--customer', ada, '--total', '1999', '--note', 'Call first']
  const more = ['--placed-at', '2026-10-09T09:30:00Z', '--on', '2026-10-09', '--size', 'large', '--done']
  const lists = ['--tags', 'red', '--tags', 'blue', '--extra', '{"x":[1,2]}', '--address', '{"city":"Oslo"}']
  const all = await ranLine(app, data, [...words, ...more, ...lists, '--json'])
  assert.equal(all.ended, 0, all.err)
  assert.deepEqual(valueOf(all.out), {
    customer: ada,
    total: 1999,
    note: 'Call first',
    placedAt: '2026-10-09T09:30:00.000Z',
    on: '2026-10-09',
    size: 'large',
    done: true,
    tags: ['red', 'blue'],
    extra: { x: [1, 2] },
    address: { city: 'Oslo' },
  })
  assert.deepEqual(valueOf((await ranLine(app, data, ['take-order', '--no-done', '--json'])).out), { done: false })
  assert.deepEqual(valueOf((await ranLine(app, data, ['take-order', '--done=false', '--json'])).out), { done: false })
  // A file flag is the path of a file of this computer: the runner uploads it first, and sends its id.
  const path = join(project, 'note.txt')
  writeFileSync(path, 'the bytes of a note')
  const filed = await ranLine(app, data, ['take-order', '--doc', path, '--json'])
  assert.equal(filed.ended, 0, filed.err)
  assert.match(String(Object(valueOf(filed.out)).doc), /^[0-9a-z]{26}$/)
  // A folder is refused.
  assert.equal((await ranLine(app, data, ['take-order', '--doc', project])).ended, 2)
})

test('[24-13] `--input -` is read, a flag wins over `--input`, `--name=value` is read as `--name value`, and `--limit=5` is read', async (t) => {
  const { app, data } = await openedCommands(t)
  const read = await ranLine(app, data, ['take-order', '--input', '-', '--json'], {
    lines: ['{"note":"from the input",', '"total":3}'],
  })
  assert.deepEqual(valueOf(read.out), { note: 'from the input', total: 3 })
  const both = await ranLine(app, data, ['take-order', '--input', '{"note":"a","total":1}', '--note', 'b', '--json'])
  assert.deepEqual(valueOf(both.out), { note: 'b', total: 1 })
  assert.deepEqual(valueOf((await ranLine(app, data, ['take-order', '--note=c', '--json'])).out), { note: 'c' })
  for (const title of ['one', 'two', 'three', 'four', 'five', 'six', 'seven'])
    await app.call('addNote', { title }, { as: system })
  const five = await ranLine(app, data, ['open-notes', '--limit=5', '--json'])
  assert.deepEqual(valueOf(five.out), ['one', 'two', 'three', 'four', 'five'])
})

test('[24-13] `--json` prints the wire form in one line, before and after the command word; a text is printed as it is, a number as it is, anything else as JSON with line breaks, and a control character as its code', async (t) => {
  const { app, data } = await openedCommands(t)
  const before = await ranLine(app, data, ['--json', 'take-order', '--note', 'x'])
  const after = await ranLine(app, data, ['take-order', '--note', 'x', '--json'])
  assert.equal(before.out.trim(), after.out.trim())
  assert.deepEqual(JSON.parse(before.out), { ok: true, value: { note: 'x' } })
  assert.equal(before.out.trim().split('\n').length, 1)
  assert.equal((await ranLine(app, data, ['who-am-i'])).out.trim(), 'no user')
  await app.call('addNote', { title: 'one' }, { as: system })
  assert.equal((await ranLine(app, data, ['open-notes'])).out.trim(), JSON.stringify(['one'], null, 2))
  const rung = (await ranLine(app, data, ['ringing'])).out
  assert.equal(rung.includes(String.fromCharCode(7)) || rung.includes(String.fromCharCode(27)), false)
  assert.match(rung, /ring\\u0007bell\\u001b\[2J/)
})

test('[24-13] both forms of `--help` print what they name: each command with its about, and a command with its flags', async (t) => {
  const { app, data } = await openedCommands(t)
  const all = await ranLine(app, data, ['--help'])
  assert.equal(all.ended, 0)
  for (const line of [
    'take-order',
    'Takes an order, and answers what it was handed',
    'open-notes',
    'weekly',
    'fetch-file',
  ])
    assert.ok(all.out.includes(line), line)
  assert.equal(all.out.includes('unlisted'), false, 'a flow that is not offered is no command')
  const one = await ranLine(app, data, ['take-order', '--help'])
  assert.equal(one.ended, 0)
  assert.match(one.out, /Takes an order/)
  assert.match(one.out, /--note\b.*text.*Note.*What the desk should know/)
  assert.match(one.out, /--placed-at\b.*date/)
  assert.match((await ranLine(app, data, ['open-notes', '--help'])).out, /--limit\b.*number.*20/)
  // With `--json` they print the list of commands, and one entry of it.
  const listed = Object(valueOf((await ranLine(app, data, ['--help', '--json'])).out))
  assert.equal(listed.app, 'shop')
  assert.equal(listed.commands['take-order'].definition, 'takeOrder')
  assert.equal(listed.commands['open-notes'].at, 'read')
  assert.equal(listed.commands.weekly.kind, 'flow')
  assert.equal(listed.commands['wipe-notes'].danger, 'ask')
  assert.equal(Object(valueOf((await ranLine(app, data, ['weekly', '--help', '--json'])).out)).definition, 'weekly')
  // `--version` prints the name of the app, its version id and the version of the runner.
  const version = await ranLine(app, data, ['--version'])
  assert.match(version.out, new RegExp(`shop ${runningVersion(app)}`))
})

test('[24-13] a call that fails ends with 1 and says why to the error output, and an unknown word, a flag that is no field and a bare word end with 2 and name the nearest', async (t) => {
  const { app, data } = await openedCommands(t)
  const failed = await ranLine(app, data, ['failing'])
  assert.equal(failed.ended, 1)
  assert.match(failed.err, /^error closed [^:]*: The shop is closed\./m)
  const wire = await ranLine(app, data, ['failing', '--json'])
  assert.equal(wire.ended, 1)
  assert.equal(Object(JSON.parse(wire.out).error).code, 'closed')
  const unknown = await ranLine(app, data, ['take-ordr'])
  assert.equal(unknown.ended, 2)
  assert.match(unknown.err, /take-order/)
  const flag = await ranLine(app, data, ['take-order', '--notes', 'x'])
  assert.equal(flag.ended, 2)
  assert.match(flag.err, /--note\b/)
  assert.equal((await ranLine(app, data, ['take-order', 'loose'])).ended, 2)
  assert.equal((await ranLine(app, data, ['unlisted', '--week', '1'])).ended, 2)
})

test('[24-13] [11-2@8a] a command runs as the caller that `--as` names, and as the system where it names none', async (t) => {
  const { app, data } = await openedCommands(t)
  const ada = await userOf(app, 'Ada')
  assert.equal((await ranLine(app, data, ['who-am-i'], { as: ada })).out.trim(), ada)
  assert.equal((await ranLine(app, data, ['staff-note'])).out.trim(), 'for the staff')
  const asAda = await ranLine(app, data, ['staff-note'], { as: ada })
  assert.equal(asAda.ended, 1)
  assert.match(asAda.err, /T3101/)
  const asNobody = await ranLine(app, data, ['staff-note'], { as: 'nobody' })
  assert.equal(asNobody.ended, 1)
  assert.match(asNobody.err, /T0006/)
  await ranLine(app, data, ['add-note', '--title', 'by ada'], { as: ada })
  const notes = await app.read({ from: 'notes' }, { as: system })
  assert.deepEqual(
    (Array.isArray(notes) ? notes : []).map((one) => Object(one).by),
    [ada],
  )
  // A request that names a caller and carries no admin token is nobody.
  const named = await app.request(
    new Request(`${here(data)}/_t/call/whoAmI`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'tent-caller': ada },
      body: JSON.stringify({ input: {} }),
    }),
    { from: '127.0.0.1' },
  )
  assert.equal(Object(await named.json()).value, 'no user')
})

test('[24-13] a function that asks a person waits for a yes at the terminal, and with no person there ends with 2 unless `--yes` was typed', async (t) => {
  const { app, data } = await openedCommands(t)
  const yes = await ranLine(app, data, ['wipe-notes', '--reason', 'old', '--code', '1234'], {
    interactive: true,
    lines: ['Yes'],
  })
  assert.equal(yes.ended, 0, yes.err)
  assert.equal(yes.out.trim(), 'wiped for old')
  assert.match(yes.err, /wipe-notes/)
  assert.match(yes.err, /--reason old/)
  assert.match(yes.err, /--code \[secret\]/)
  assert.equal(yes.err.includes('1234'), false)
  assert.match(yes.err, /Run it\? \(y\/n\)/)
  const no = await ranLine(app, data, ['wipe-notes', '--reason', 'old'], { interactive: true, lines: ['n'] })
  assert.equal(no.ended, 1)
  assert.equal(no.out, '')
  const nobody = await ranLine(app, data, ['wipe-notes', '--reason', 'old'])
  assert.equal(nobody.ended, 2)
  assert.match(nobody.err, /--yes/)
  const forced = await ranLine(app, data, ['--yes', 'wipe-notes', '--reason', 'forced'])
  assert.equal(forced.ended, 0, forced.err)
  assert.equal(forced.out.trim(), 'wiped for forced')
})

test("[24-13] a flow that is offered is a command that answers the flow's answer, and a function named `file` has the word that `cli.names` gives it", async (t) => {
  const { app, data } = await openedCommands(t)
  const flowed = await ranLine(app, data, ['weekly', '--week', '3', '--json'])
  assert.equal(flowed.ended, 0, flowed.err)
  assert.deepEqual(valueOf(flowed.out), { week: 3, sum: 6 })
  assert.equal((await ranLine(app, data, ['fetch-file'])).out.trim(), 'a file')
})

test('[23-30@8a] a flow that states `access` and no `offer` is not found at `/api/`, and is no command', async (t) => {
  const { app, data } = await openedCommands(t)
  const asked = await app.request(new Request(`${here(data)}/api/unlisted`, { method: 'POST', body: '{"week":1}' }))
  assert.equal(asked.status, 404)
  const listed = Object(valueOf((await ranLine(app, data, ['--help', '--json'])).out))
  assert.equal(
    Object.values<{ definition: string }>(listed.commands).some((one) => one.definition === 'unlisted'),
    false,
  )
})

test('[24-13] `/_t/cli` answers the list of commands, and `{ same: true }` for the running version; `/_t/cli/me` names the caller', async (t) => {
  const { app, data } = await openedCommands(t)
  const listed = await app.request(new Request(`${here(data)}/_t/cli`))
  const body = Object(await listed.json())
  assert.equal(body.ok, true)
  assert.equal(body.value.version, runningVersion(app))
  const same = await app.request(new Request(`${here(data)}/_t/cli?have=${body.value.version}`))
  assert.deepEqual(Object(await same.json()).value, { same: true })
  const me = await app.request(new Request(`${here(data)}/_t/cli/me`))
  assert.deepEqual(Object(await me.json()).value, {})
})

test('[24-13] with no engine running, a command starts one on the development data, answers, and leaves nothing running', async (t) => {
  const project = copied(t, 'line-none', 'commanded')
  const answered = program(project, 'cli', project, 'open-notes', '--json')
  assert.equal(answered.status, 0, answered.err)
  assert.deepEqual(JSON.parse(answered.out), { ok: true, value: [] })
  assert.equal(existsSync(join(project, '.tent', 'engine.json')), false)
  // `--as` stands before the command word, and an id of no user ends with 2.
  assert.equal(program(project, 'cli', project, '--as', 'nobody', 'who-am-i').out.trim(), 'no user')
  assert.equal(program(project, 'cli', project, '--as', 'no-such-user', 'who-am-i').status, 2)
})

test('[24-13] a function named `login` that is offered to `cli` is T1009, and a project whose command is named `tent` is T1014', async (t) => {
  const project = copied(t, 'line-reserved', 'commanded')
  const file = join(project, 'file.ts')
  writeFileSync(file, readFileSync(file, 'utf8').replaceAll("'file'", "'login'").replace('const file', 'const login'))
  const named = join(project, 'tent.ts')
  writeFileSync(
    named,
    readFileSync(named, 'utf8').replace("cli: { names: { file: 'fetch-file' } }", "cli: { name: 'tent' }"),
  )
  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    built.findings
      .filter((one) => one.level === 'error')
      .map((one) => one.code)
      .sort(),
    ['T1009', 'T1014'],
  )
})
