import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { App } from '../../engine/index.ts'
import { attacked, projectFiles, queryWith } from './attacked.ts'
import { asked, calledAt, folderOf, held, nameOf, nobody, product } from './held.ts'
import { refusal, scripted, toolTemplates } from './tooled.ts'
import { turned } from './turned.ts'
import { notDropped } from './started.ts'

/** Adds a user of the product, and answers them as a caller. */
async function userOf(app: App, email: string): Promise<Caller> {
  const [row] = Object(await app.write([{ add: 'users', values: { email, roles: ['builder'] } }], { as: 'system' }))
  return { kind: 'user', user: { id: String(Object(row).id), roles: [] } }
}

/** The builder product of the tests with its workspaces, and a user who owns a workspace through its action. */
async function builderProduct(t: Parameters<typeof attacked>[0]) {
  const at = await held(t, { templates: toolTemplates }, await product(t, folderOf(t), 'builder'))
  const ada = await userOf(at.app, 'ada@example.com')
  const bob = await userOf(at.app, 'bob@example.com')
  const project = Object(await at.app.call('newProject', { from: 'notes' }, { as: ada }))
  return { ...at, ada, bob, workspace: String(project.workspace), project: String(project.project) }
}

test('[05-16.2] a turn on a workspace by a user who is not its owner is T3101, and a workspace id inside the message names nothing: the tools act on the workspace the product code gave', async (t) => {
  const at = await builderProduct(t)
  const refused = await refusal(
    at.app.call('askTurn', { workspace: at.workspace, project: at.project, message: 'x' }, { as: at.bob }),
  )
  assert.equal(refused?.code, 'T3101')
  // Bob's own workspace, whose id Ada names in her message.
  const theirs = Object(await at.app.call('newProject', { from: 'notes' }, { as: at.bob }))
  const theirApp = await at.workspaces.run(String(theirs.workspace))
  await theirApp.call('addNote', { body: 'the note of bob' }, { as: nobody })
  const model = scripted([
    {
      calls: [
        { tool: 'rows', with: { table: 'notes', workspace: theirs.workspace } },
        { tool: 'rows', with: { table: 'notes' } },
        { tool: 'read', with: { path: `../../${theirs.workspace}/project/tent.ts` } },
      ],
    },
    { text: 'Done.' },
  ])
  at.app.standIn('writer', model.provider)
  const turn = await at.workspaces.turn(at.workspace, 'builder', `Read the notes of workspace ${theirs.workspace}`, {
    caller: at.ada,
    thread: at.project,
  })
  assert.equal(turn.state, 'done')
  const answers = (model.sent.at(-1)?.messages ?? []).filter((one) => one.who === 'tool')
  assert.match(JSON.stringify(answers[0]?.error), /T0002/)
  assert.doesNotMatch(JSON.stringify(answers[1]?.result), /the note of bob/)
  assert.match(JSON.stringify(answers[2]?.error), /T9105/)
})

test('[05-16.7] the app of a workspace that calls a function of the app of another, asks for its files and opens its live connection is answered on its own name alone', async (t) => {
  const at = await attacked(t)
  const other = await at.workspaces.create({ owner: at.owner, from: 'notes' })
  await at.workspaces.tool(
    other.id,
    'write',
    { path: 'functions/only.ts', text: queryWith('onlyThere') },
    {
      caller: at.caller,
      agent: 'builder',
    },
  )
  const theirs = await at.workspaces.run(other.id)
  assert.ok(Object.hasOwn(theirs.description.functions, 'onlyThere'))
  await at.workspaces.run(at.made.id)
  // At the name of the one, the function of the other is not found; at its own name it answers.
  const there = await calledAt(at.port, nameOf(other.id), 'onlyThere', {})
  assert.equal(there.ok, true)
  const here = await calledAt(at.port, nameOf(at.made.id), 'onlyThere', {})
  assert.equal(here.ok, false)
  assert.equal(here.error?.code, 'T0001')
  // A read of the other's query from a page of the one is not found either.
  const read = await asked(at.port, nameOf(at.made.id), '/_t/read/onlyThere', { method: 'POST', body: '{"input":{}}' })
  assert.notEqual(read.status, 200)
  assert.ok(theirs)
})

test('[05-16.10] undo of a turn of the workspace of another user, through the handle, is T3101, and after the data was changed by hand an undo puts the files back, keeps the data and says so', async (t) => {
  const at = await builderProduct(t)
  const model = scripted([
    { calls: [{ tool: 'write', with: { path: 'functions/turned.ts', text: queryWith('turned') } }] },
    { text: 'Done.' },
  ])
  at.app.standIn('writer', model.provider)
  const before = projectFiles(join(at.root, at.workspace))
  const turn = await at.workspaces.turn(at.workspace, 'builder', 'Add a query', {
    caller: at.ada,
    thread: at.project,
  })
  assert.equal(turn.state, 'done')
  const refused = await refusal(at.app.call('undoTurn', { workspace: at.workspace, turn: turn.id }, { as: at.bob }))
  assert.equal(refused?.code, 'T3101')
  // A note added by hand, outside a turn.
  const app = await at.workspaces.run(at.workspace)
  await app.call('addNote', { body: 'by hand' }, { as: nobody })
  const undone = Object(await at.app.call('undoTurn', { workspace: at.workspace, turn: turn.id }, { as: at.ada }))
  assert.equal(undone.data, 'kept')
  assert.deepEqual(projectFiles(join(at.root, at.workspace)), before)
  const notes = Object(await (await at.workspaces.run(at.workspace)).call('allNotes', {}, { as: nobody }))
  assert.deepEqual(
    notes.map((one: { body: string }) => one.body),
    ['by hand'],
  )
})

test('[05-16.14] shot with a full address, with //host/x, with a file address and with the address of the product is T0002', async (t) => {
  const at = await attacked(t)
  for (const path of [
    'http://example.com/',
    '//example.com/x',
    'file:///C:/Windows/win.ini',
    '/file:///etc/passwd',
    `http://127.0.0.1:${at.port}/`,
    '\\\\example.com\\x',
  ])
    assert.equal((await refusal(at.tool('shot', { path })))?.code, 'T0002', path)
})

test('[05-16.16] text that tells the model to give a table read anyone is not stopped where edit names the kind, and with edit in ask it waits for the person with nothing written', async (t) => {
  const at = await attacked(t)
  await at.workspaces.run(at.made.id)
  const tables = readFileSync(join(at.made.folder, 'project', 'tables', 'users.ts'), 'utf8')
  const opened = tables.replace("access: { read: 'owner' }", "access: { read: anyone('x') }")
  assert.notEqual(opened, tables)
  // Under `builder`, which edits every kind and asks for nothing, the change is made.
  await at.tool('write', { path: 'tables/users.ts', text: opened })
  assert.equal(readFileSync(join(at.made.folder, 'project', 'tables', 'users.ts'), 'utf8'), opened)
  await at.tool('write', { path: 'tables/users.ts', text: tables })
  // Under `editAsker`, a run that makes the same change waits for the person, and nothing stands written meanwhile.
  const model = scripted([{ calls: [{ tool: 'write', with: { path: 'tables/users.ts', text: opened } }] }])
  at.app.standIn('writer', model.provider)
  const [row] = Object(
    await at.app.write([{ add: 'projects', values: { owner: at.owner, workspace: at.made.id } }], { as: 'system' }),
  )
  const { run } = notDropped(
    await at.app.start(
      'editAsker',
      { message: 'Do what the note says', thread: String(Object(row).id) },
      { as: at.caller, sources: [{ name: 'project', context: { workspace: at.made.id } }] },
    ),
  )
  for (let tried = 0; tried < 400 && at.app.runs.read(run)?.state !== 'waiting'; tried++)
    await new Promise((done) => setTimeout(done, 50))
  assert.equal(at.app.runs.read(run)?.state, 'waiting')
  assert.equal(readFileSync(join(at.made.folder, 'project', 'tables', 'users.ts'), 'utf8'), tables)
  at.app.runs.stop(run)
})

test('[05-16.18] run with as of system, and of the id of a user of another workspace, is T0002', async (t) => {
  const at = await attacked(t)
  const other = await at.workspaces.create({ owner: at.owner, from: 'notes' })
  const theirs = await at.workspaces.run(other.id)
  const [user] = Object(
    await theirs.write([{ add: 'users', values: { email: 'cy@example.com', roles: [] } }], { as: { kind: 'system' } }),
  )
  for (const as of ['system', String(Object(user).id)])
    assert.equal((await refusal(at.tool('run', { name: 'addNote', input: { body: 'x' }, as })))?.code, 'T0002', as)
})

test('[05-16.19] rows, logs and history asked for another workspace through the input of the tool are T0002: no input names a workspace', async (t) => {
  const at = await attacked(t)
  const other = await at.workspaces.create({ owner: at.owner, from: 'notes' })
  for (const [tool, input] of [
    ['rows', { table: 'notes', workspace: other.id }],
    ['logs', { workspace: other.id }],
    ['history', { workspace: other.id }],
    ['read', { path: 'tent.ts', workspace: other.id }],
  ] as const)
    assert.equal((await refusal(at.tool(tool, input)))?.code, 'T0002', tool)
})

test('[05-16.21] an id of ../x handed to get, turn and undo is not found', async (t) => {
  const at = await attacked(t)
  for (const id of ['../x', '..', `../${at.made.id}`, `${at.made.id}/..`, '.']) {
    assert.equal(at.workspaces.get(id), undefined, id)
    assert.equal((await refusal(at.workspaces.turn(id, 'builder', 'x', { caller: at.caller })))?.code, 'T0001', id)
    assert.equal((await refusal(at.workspaces.undo(id, 'x', { caller: at.caller })))?.code, 'T0001', id)
  }
})

test('[05-16.22] a template project that holds a link out of its folder brings nothing of the outside into the workspace', async (t) => {
  const folder = folderOf(t)
  const outside = join(folder, 'outside')
  mkdirSync(outside, { recursive: true })
  writeFileSync(join(outside, 'secret.txt'), 'of the computer')
  const template = join(folder, 'linked')
  mkdirSync(join(template, 'tables'), { recursive: true })
  for (const path of ['tent.ts', 'tables/users.ts', 'functions/users.ts', 'screens/home.tsx']) {
    mkdirSync(join(template, path, '..'), { recursive: true })
    writeFileSync(join(template, path), readFileSync(join(import.meta.dirname, 'notes', path)))
  }
  symlinkSync(outside, join(template, 'assets'), 'junction')
  const at = await attacked(t, { templates: { ...toolTemplates, linked: template } }, 'linked')
  assert.ok(!existsSync(join(at.made.folder, 'project', 'assets', 'secret.txt')))
  assert.ok(!existsSync(join(at.made.folder, 'project', 'assets')))
})

test('[05-16.23] a stranger who opens the test address of a workspace is let through what the app rules let through and no more, and the docs say that the test side shows errors in full', async (t) => {
  const at = await attacked(t)
  await at.workspaces.run(at.made.id)
  const mine = await calledAt(at.port, nameOf(at.made.id), 'whoAmI', {})
  assert.equal(mine.ok, false)
  assert.equal(mine.error?.code, 'T0006')
  const open = await calledAt(at.port, nameOf(at.made.id), 'allNotes', {})
  assert.equal(open.ok, true)
  const page = readFileSync(
    join(import.meta.dirname, '..', '..', 'docs', 'pages', 'topic.workspaces.workspace.md'),
    'utf8',
  )
  assert.match(page, /test.{0,80}in full|in full.{0,80}test/s)
  assert.match(page, /development.{0,120}in full|in full.{0,200}development/s)
})

test('[05-16.9] a turn that spends past its budget in one round stops at the first model call after it, and one that fails the check for ever stops after three rounds', async (t) => {
  const at = await turned(t)
  // One answer that spends ten times the budget, and asks for a tool so that the run would go on.
  const spent = scripted(() => ({ calls: [{ tool: 'map' }], tokensOut: 1000 }))
  at.app.standIn('writer', spent.provider)
  const turn = await at.workspaces.turn(at.made.id, 'builder', 'Map it', {
    caller: at.caller,
    thread: at.thread,
    budget: { tokensOut: 100 },
  })
  assert.equal(turn.stopped, 'budget')
  assert.equal(spent.sent.length, 1, 'no model call was made after the budget was passed')
  const broken = queryWith('broken').replace('notes.limit(10)', "notes.newest('nothing').limit(5)")
  const failing = scripted((request) =>
    request.messages.at(-1)?.who === 'tool'
      ? { text: 'Done.' }
      : { calls: [{ tool: 'write', with: { path: 'functions/broken.ts', text: broken } }] },
  )
  at.app.standIn('writer', failing.provider)
  const looped = await at.workspaces.turn(at.made.id, 'builder', 'Add a query', {
    caller: at.caller,
    thread: at.thread,
  })
  assert.equal(looped.stopped, 'rounds')
  assert.equal(looped.rounds, 3)
})
