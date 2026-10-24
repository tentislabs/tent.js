import assert from 'node:assert/strict'
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runKilled } from '../../../rig/kill.ts'
import { setHere, sqliteStore } from '../../data/index.ts'
import type { App } from '../index.ts'
import { makeSecretKey, readSecrets, replaceSecretKey, storedValues, unreadSecrets } from '../index.ts'
import { forgetSeal, sealedAt } from '../values/seal.ts'
import type { Running } from './apps.ts'
import { codeOf, running, system, workFolder } from './apps.ts'

const program = fileURLToPath(new URL('./held/replacing.ts', import.meta.url))

/** An app with a key, a secret of test data and one of live data, and so many rows with a sealed note. */
async function withSealed(t: test.TestContext, rows: number): Promise<Running> {
  const run = await running(t, { project: 'valued' })
  makeSecretKey(run.dataFolder)
  for (let k = 0; k < rows; k++)
    await run.app.call(
      'keep',
      { title: `note ${String(k).padStart(5, '0')}`, note: `what is kept in ${k}`, pin: k },
      { as: system },
    )
  await run.app.close()
  storedValues(run.dataFolder, run.bundle.description, {
    kind: 'secrets',
    name: 'PAY_KEY',
    value: 'the value of test data',
  })
  storedValues(run.dataFolder, run.bundle.description, {
    kind: 'secrets',
    live: true,
    name: 'PAY_KEY',
    value: 'the value of live data',
  })
  return run
}

/** The notes of every row, as an app that is opened on the folder reads them. */
async function notesOf(run: Running): Promise<{ app: App; notes: string[] }> {
  const app = await run.engine.open(run.bundle.folder, { dataFolder: run.dataFolder, mode: 'test' })
  const rows = Object(await app.call('kept', {}, { as: system }))
  return { app, notes: rows.map((row: { note: string; pin: number }) => `${row.note} ${row.pin}`) }
}

const keyOf = (dataFolder: string): string => readFileSync(join(dataFolder, 'secret.key'), 'utf8')

/** The sealed texts of the notes, as the data file holds them. */
function storedNotes(dataFolder: string): string[] {
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    return data
      .prepare('SELECT note FROM "vault" ORDER BY title')
      .all()
      .map((row) => String(row.note))
  } finally {
    data.close()
  }
}

test('[22-14a] after the key of the secrets was replaced every secret and every sealed value still opens, and the old key opens nothing; with an engine running on the folder nothing is replaced', async (t) => {
  const run = await withSealed(t, 12)
  const { dataFolder } = run
  const [oldKey, oldNotes] = [keyOf(dataFolder), storedNotes(dataFolder)]
  // With an engine running on the folder the command stops, and changes nothing.
  const open = await notesOf(run)
  assert.equal(await codeOf(replaceSecretKey(dataFolder)), 'T0013')
  assert.equal(keyOf(dataFolder), oldKey)
  await open.app.close()

  const done = await replaceSecretKey(dataFolder)
  // Twelve notes and twelve numbers were sealed again, and the secrets of both files written again.
  assert.deepEqual(done, { role: 'writer', sealed: 24, secrets: 2 })
  const newKey = keyOf(dataFolder)
  assert.notEqual(newKey, oldKey)
  assert.match(newKey, /^[A-Za-z0-9+/]{43}=\n$/)
  // The new key took the place of the old one, and nothing lies beside the files any more.
  assert.deepEqual(
    readdirSync(dataFolder).filter((name) => /\.(next|again)$/.test(name)),
    [],
  )
  // Every sealed value was written anew, and every one opens.
  const newNotes = storedNotes(dataFolder)
  assert.equal(newNotes.length, 12)
  for (const [at, note] of newNotes.entries()) assert.notEqual(note, oldNotes[at])
  const after = await notesOf(run)
  assert.deepEqual(
    after.notes,
    Array.from({ length: 12 }, (_, k) => `what is kept in ${k} ${k}`),
  )
  await after.app.close()
  assert.deepEqual(readSecrets(dataFolder).sort(), ['the value of live data', 'the value of test data'])
  assert.deepEqual(unreadSecrets(dataFolder), [])

  // The old key opens nothing: no secret, and no sealed value.
  writeFileSync(join(dataFolder, 'secret.key'), oldKey)
  assert.deepEqual(readSecrets(dataFolder), [])
  assert.deepEqual(unreadSecrets(dataFolder), ['secrets.test', 'secrets.live'])
  forgetSeal(dataFolder)
  const underOld = sealedAt(dataFolder).seal
  assert.throws(() => underOld?.open(newNotes[0], 'vault.note.any'), { code: 'T0019' })
  writeFileSync(join(dataFolder, 'secret.key'), newKey)
  forgetSeal(dataFolder)
  // With no key at hand there is nothing to replace.
  const bare = workFolder(t)
  cpSync(join(dataFolder, 'data.db'), join(bare, 'data.db'))
  assert.equal(await codeOf(replaceSecretKey(bare)), 'T0019')
})

test('[22-14a] a kill in the middle of the replacing of the key loses neither a secret nor a sealed value: the next run finishes it', async (t) => {
  const run = await withSealed(t, 1500)
  const { dataFolder } = run
  const before = keyOf(dataFolder)
  // The program is killed at any moment of its work, five times, and each time started again until it ends by itself.
  const ended = await runKilled(program, { times: 5, within: 1500, args: [dataFolder], wait: 120_000 })
  assert.equal(ended.kills, 5)
  for (const round of ended.ended) assert.equal(round.code, 0, round.out)
  // Whatever each kill left, the folder holds one key, and every secret and every sealed value opens under it.
  assert.notEqual(keyOf(dataFolder), before)
  assert.deepEqual(
    readdirSync(dataFolder).filter((name) => /\.(next|again)$/.test(name)),
    [],
  )
  assert.deepEqual(readSecrets(dataFolder).sort(), ['the value of live data', 'the value of test data'])
  assert.deepEqual(unreadSecrets(dataFolder), [])
  const after = await notesOf(run)
  assert.equal(after.notes.length, 1500)
  assert.deepEqual(after.notes.slice(0, 2), ['what is kept in 0 0', 'what is kept in 1 1'])
  assert.equal(after.notes.at(-1), 'what is kept in 1499 1499')
  await after.app.close()
})

test('[22-14a] on the folder of a reader the command makes no key and seals no data: handed the key that the run on the writer made, it writes the secrets files of that folder again under it, once no value of its data opens under the old key alone', async (t) => {
  const run = await withSealed(t, 6)
  const writer = run.dataFolder
  // The folder of a reader: a copy of the data and of the files of the writer, with the role of a reader.
  const reader = workFolder(t)
  for (const name of ['data.db', 'secret.key', 'secrets.test', 'secrets.live'])
    cpSync(join(writer, name), join(reader, name))
  const mark = (folder: string): void => {
    const store = sqliteStore()
    store.open(folder)
    setHere(store, { role: 'reader', from: 'https://writer.example' })
    store.close()
  }
  mark(reader)
  const oldKey = keyOf(reader)
  const oldFiles = ['secrets.test', 'secrets.live'].map((name) => readFileSync(join(reader, name), 'utf8'))
  const oldNotes = storedNotes(reader)

  // Without the new key laid into the folder the command stops, names what is missing, and writes nothing.
  const missing = await replaceSecretKey(reader).catch((error) => error)
  assert.equal(missing.code, 'T0013')
  assert.match(`${missing.message} ${missing.fix}`, /secret\.key\.next/)
  assert.equal(existsSync(join(reader, 'secret.key.next')), false)

  // The writer replaces its key, and its new key is laid into the folder of the reader.
  await replaceSecretKey(writer)
  const newKey = keyOf(writer)
  writeFileSync(join(reader, 'secret.key.next'), newKey)
  // The reader was not handed the newly sealed rows yet: the command stops, and writes nothing.
  const behind = await replaceSecretKey(reader).catch((error) => error)
  assert.equal(behind.code, 'T0013')
  assert.match(`${behind.message} ${behind.fix}`, /join its writer/)
  assert.equal(keyOf(reader), oldKey)
  assert.equal(readFileSync(join(reader, 'secret.key.next'), 'utf8'), newKey)
  assert.deepEqual(
    ['secrets.test', 'secrets.live'].map((name) => readFileSync(join(reader, name), 'utf8')),
    oldFiles,
  )
  assert.deepEqual(storedNotes(reader), oldNotes)
  // With the file laid in its folder, a secret and a sealed value open under either key.
  assert.deepEqual(readSecrets(reader).sort(), ['the value of live data', 'the value of test data'])
  forgetSeal(reader)
  const either = sealedAt(reader).seal
  const fromWriter = storedNotes(writer)
  assert.equal(typeof either?.open(oldNotes[0], boundOfFirst(reader)), 'string')
  assert.equal(either?.open(fromWriter[0], boundOfFirst(writer)), either?.open(oldNotes[0], boundOfFirst(reader)))

  // The reader joined its writer again, and holds the rows as the writer sealed them.
  cpSync(join(writer, 'data.db'), join(reader, 'data.db'))
  mark(reader)
  const done = await replaceSecretKey(reader)
  assert.deepEqual(done, { role: 'reader', sealed: 0, secrets: 2 })
  // It made no key of its own, and sealed no data: the rows are the writer's, text for text.
  assert.equal(keyOf(reader), newKey)
  assert.equal(existsSync(join(reader, 'secret.key.next')), false)
  assert.deepEqual(storedNotes(reader), fromWriter)
  assert.deepEqual(readSecrets(reader).sort(), ['the value of live data', 'the value of test data'])
  assert.deepEqual(unreadSecrets(reader), [])
})

/** What the note of the first row of a data folder is bound to. */
function boundOfFirst(dataFolder: string): string {
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    const [row] = data.prepare('SELECT * FROM "vault" ORDER BY title LIMIT 1').all()
    return `vault.note.${String(row.id ?? row._id)}`
  } finally {
    data.close()
  }
}
