import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { appIn } from './desks.ts'
import { closing, copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

/**
 * The notebook, with a person who writes in it and three notes of theirs. With `ledger`, the port of a service of
 * this computer, the run that tidies tells that service too, after its mail.
 */
async function notebook(t: TestContext, o: { archive?: false; ledger?: number } = {}) {
  const folder = copyOf(t, 'undone')
  if (o.archive === false) {
    const file = join(folder, 'tent.ts')
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('backups: { every: false },', 'backups: { every: false, archive: false },'),
    )
  }
  if (o.ledger !== undefined) {
    const project = join(folder, 'tent.ts')
    writeFileSync(
      project,
      readFileSync(project, 'utf8').replace(
        "title: 'Notebook',",
        "title: 'Notebook',\n  privateHosts: ['http://127.0.0.1'],",
      ),
    )
    const functions = join(folder, 'functions', 'functions.ts')
    const told = "text: 'The notebook is tidied.' }))"
    writeFileSync(
      functions,
      `${readFileSync(functions, 'utf8')
        .replace(
          "import { action, boolean, change, date, flow, input, json, mail, text, undo } from 'tentjs'",
          "import { action, boolean, change, date, flow, input, json, mail, post, service, text, undo } from 'tentjs'",
        )
        .replace(told, `${told}\n    await step('ledger', () => ledger.told({ what: 'tidied' }))`)}
// A service of this computer that the run tells what it did.
export const ledger = service('ledger', {
  url: 'http://127.0.0.1:${o.ledger}',
  calls: { told: post('/told', { input: { what: text() } }) },
})
`,
    )
  }
  const app = await testApp({ folder, ...(o.ledger === undefined ? {} : { real: ['ledger'] }) })
  closing(t, () => app.close())
  const ada = await app.user({ name: 'Ada', roles: [] })
  const as = { as: ada }
  const ids: string[] = []
  for (const title of ['first', 'second', 'third'])
    ids.push(String(Reflect.get(Object(await app.call('addNote', { title }, as)), 'id')))
  return { app, ada, as, ids }
}

/** A fingerprint of the rows of the notebook, as they stand: the same rows have the same one. */
async function printOf(app: TestApp): Promise<string> {
  const rows: unknown = await app.read({ from: 'notes', sort: [{ by: 'title' }] }, system)
  const tags: unknown = await app.read({ from: 'tags', sort: [{ by: 'word' }] }, system)
  const plain = (list: unknown) =>
    (Array.isArray(list) ? list : []).map((one) => {
      const { createdAt: _, updatedAt: __, ...rest } = Object(one)
      return rest
    })
  return createHash('sha256')
    .update(JSON.stringify([plain(rows), plain(tags)]))
    .digest('hex')
}

/** A run of the flow that tidies, over three notes, which has ended. */
async function tidied(app: TestApp, ids: string[]): Promise<string> {
  const started = await app.start('tidy', { rename: ids[0], finish: ids[1], drop: ids[2] }, system)
  assert.ok('run' in started, 'the start was not dropped')
  const { run } = started
  await app.runs.wait(run)
  return run
}

/**
 * The changes that the archive of a data folder holds, without their records, in the order they were made: of
 * each part that was sent, each that waits, and the part that is open. Each stands behind the count of its bytes.
 */
function archivedChanges(dataFolder: string): Record<string, unknown>[] {
  const backups = join(dataFolder, 'backups')
  const files = [
    ...(existsSync(join(backups, 'archive'))
      ? readdirSync(join(backups, 'archive'))
          .filter((name) => name.endsWith('.changes'))
          .map((name) => join(backups, 'archive', name))
      : []),
    ...(existsSync(join(backups, 'archive', 'open.part')) ? [join(backups, 'archive', 'open.part')] : []),
  ]
  const changes: Record<string, unknown>[] = []
  for (const file of files) {
    const bytes = readFileSync(file)
    for (let at = 0; at + 4 <= bytes.length; ) {
      const head = bytes.readUInt32BE(at)
      changes.push(Object(JSON.parse(bytes.subarray(at + 4, at + 4 + head).toString('utf8'))))
      at += 8 + head + bytes.readUInt32BE(at + 4 + head)
    }
  }
  return changes.sort((a, b) => Number(a.at) - Number(b.at) || Number(a.n) - Number(b.n))
}

const answerOf = (value: unknown) => {
  const read: Record<string, unknown> = Object(value)
  return {
    undone: Number(read.undone),
    clashes: Array.isArray(read.clashes) ? read.clashes.map((one) => Object(one)) : [],
    outside: Array.isArray(read.outside) ? read.outside.map((one) => Object(one)) : [],
  }
}

test('[45-17] a run that adds, sets and removes rows is undone, and the rows stand as before it; dry changes nothing and answers the same; the undo is undone in its turn', async (t) => {
  const { app, ids } = await notebook(t)
  const before = await printOf(app)
  const run = await tidied(app, ids)
  const after = await printOf(app)
  assert.notEqual(after, before)
  const dry = answerOf(await app.call('undoRun', { run, dry: true }, system))
  assert.equal(await printOf(app), after, 'dry changes nothing')
  // The undo is made by a run of its own, so that its change is that run's.
  const restarted = await app.start('reverse', { run }, system)
  assert.ok('run' in restarted, 'the start was not dropped')
  const { run: reversing } = restarted
  const undone = answerOf(await app.runs.wait(reversing))
  assert.deepEqual(undone, dry, 'dry answers the same')
  assert.equal(undone.undone, 5, 'two rows added, two set, one removed')
  assert.deepEqual(undone.clashes, [])
  assert.equal(await printOf(app), before, 'the rows stand as before the run')
  const removed: unknown = await app.read({ from: 'notes', one: 'get', id: ids[2] }, system)
  assert.equal(Reflect.get(Object(removed), 'id'), ids[2], 'a removed row is put back with its id')
  // The undo is one change of its own, written as the caller of undo: it is undone in its turn.
  const again = answerOf(await app.call('undoRun', { run: reversing }, system))
  assert.equal(again.undone, 5)
  assert.equal(await printOf(app), after, 'the undo of the undo leaves what the run left')
})

test('[45-17] a row someone set after the run is left and named in clashes, and so is a row another links to', async (t) => {
  const { app, as, ids } = await notebook(t)
  const run = await tidied(app, ids)
  const added: unknown = await app.read({ from: 'notes', where: { col: 'title', is: 'Added by the run' } }, system)
  const [mine] = Array.isArray(added) ? added : []
  const linked = String(Reflect.get(Object(mine), 'id'))
  // After the run, Ada renames the note the run renamed, and tags a note the run added.
  await app.call('setNote', { note: ids[0], title: 'Ada wrote this after' }, as)
  await app.call('tagNote', { note: linked, word: 'kept' }, as)
  const undone = answerOf(await app.call('undoRun', { run }, system))
  const renamed: unknown = await app.read({ from: 'notes', one: 'get', id: ids[0] }, system)
  assert.equal(Reflect.get(Object(renamed), 'title'), 'Ada wrote this after', 'what was written after the run stands')
  const clash = undone.clashes.find((one) => one.id === ids[0])
  assert.deepEqual(clash && [clash.table, clash.columns, Object(clash.left).title, Object(clash.now).title], [
    'notes',
    ['title'],
    'Renamed by the run',
    'Ada wrote this after',
  ])
  const held = undone.clashes.find((one) => one.id === linked)
  assert.equal(held?.table, 'notes', 'a row another links to is left and named')
  const still: unknown = await app.read({ from: 'notes', one: 'get', id: linked }, system)
  assert.equal(Reflect.get(Object(still), 'id'), linked)
  // The rest of the run is taken back.
  const finished: unknown = await app.read({ from: 'notes', one: 'get', id: ids[1] }, system)
  assert.equal(Reflect.get(Object(finished), 'done'), false)
})

test('[45-17] the mail and the service call of a run are named in outside, from its trace', async (t) => {
  const paths: string[] = []
  const server = createServer(async (request, response) => {
    for await (const _ of request);
    paths.push(request.url ?? '/')
    response.writeHead(200, { 'content-type': 'application/json' }).end('{}')
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  closing(t, () => new Promise<void>((done) => server.close(() => done())))
  const address = server.address()
  const { app, ids } = await notebook(t, { ledger: typeof address === 'object' && address ? address.port : 0 })
  const run = await tidied(app, ids)
  assert.deepEqual(paths, ['/told'], 'the service was called')
  const undone = answerOf(await app.call('undoRun', { run, dry: true }, system))
  assert.deepEqual(
    undone.outside.map((one) => [one.kind, one.name]),
    [
      ['mail', 'mail.send'],
      ['service', 'ledger.told'],
    ],
  )
})

test('[45-17] undo.grant takes back what a program wrote with a grant since a moment, and nothing of another grant', async (t) => {
  const { app, ada, ids } = await notebook(t)
  const user = ada.user ?? { id: '', roles: [] }
  const mcp = (grant: string): { as: Caller } => ({
    as: { kind: 'mcp', user, grant: { id: grant, client: 'a chat app', scopes: [], for: 'mcp' } },
  })
  const since = new Date()
  await app.call('setNote', { note: ids[0], title: 'by the chat app' }, mcp('grant-1'))
  await app.call('addNote', { title: 'added by the chat app' }, mcp('grant-1'))
  await app.call('setNote', { note: ids[1], title: 'by another program' }, mcp('grant-2'))
  const undone = answerOf(await app.call('undoGrant', { grant: 'grant-1', since }, system))
  assert.equal(undone.undone, 2)
  const rows: unknown = await app.read({ from: 'notes', sort: [{ by: 'title' }] }, system)
  assert.deepEqual(
    (Array.isArray(rows) ? rows : []).map((one) => Reflect.get(Object(one), 'title')),
    ['by another program', 'first', 'third'],
  )
})

test('[45-17] a change of the system outside a run is recorded as made by the system, by no one unknown, and with the archive off undo is T2028', async (t) => {
  const off = await notebook(t, { archive: false })
  const run = await tidied(off.app, off.ids)
  await assert.rejects(off.app.call('undoRun', { run }, system), { code: 'T2028' })
  const { app, ids } = await notebook(t)
  const since = new Date()
  // A raw write of the system names its caller, the system: it is no change of the grant, and of no one unknown.
  await app.write([{ change: 'notes', id: ids[0], values: { title: 'by the system' } }], system)
  const undone = answerOf(await app.call('undoGrant', { grant: 'grant-1', since }, system))
  assert.equal(undone.undone, 0)
  assert.deepEqual(
    undone.clashes.map((one) => [one.table, one.id, one.by]),
    [],
  )
})

test('[45-17] the record of a change says by whom it was made as { caller, run }, the caller as one column keeps it: grant:<id> for a program, user:<id> for a person, and the run it was made in', async (t) => {
  const { app, dataFolder } = await appIn(t, copyOf(t, 'undone'))
  const ada = await app.user({ name: 'Ada', roles: [] })
  const user = ada.user ?? { id: '', roles: [] }
  const program: Caller = { kind: 'mcp', user, grant: { id: 'grant-9', client: 'a chat app', scopes: [], for: 'mcp' } }
  await app.call('addNote', { title: 'by the chat app' }, { as: program })
  const ids: string[] = []
  for (const title of ['first', 'second', 'third'])
    ids.push(String(Reflect.get(Object(await app.call('addNote', { title }, { as: ada })), 'id')))
  const run = await tidied(app, ids)
  const bys = archivedChanges(dataFolder).map((change) => change.by)
  assert.ok(
    bys.some((by) => isDeepStrictEqual(by, { caller: 'grant:grant-9' })),
    JSON.stringify(bys),
  )
  assert.ok(bys.some((by) => isDeepStrictEqual(by, { caller: `user:${user.id}` })))
  assert.ok(bys.some((by) => isDeepStrictEqual(by, { caller: 'system', run })))
  await app.write([{ change: 'notes', id: ids[0], values: { title: 'by the system' } }], { as: { kind: 'system' } })
  assert.deepEqual(archivedChanges(dataFolder).at(-1)?.by, { caller: 'system' })
})
