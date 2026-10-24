import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { replaceSecretKey } from '../../engine/index.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { beat, current, level } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'

const origin = 'http://localhost'

/** A read that a page sends to a machine, as the wire answers it. */
async function read(machine: TestApp, name: string): Promise<unknown> {
  const answer = await machine.request(
    new Request(`${origin}/_t/read/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ input: {} }),
    }),
  )
  return Object(await answer.json())
}

/** The writer of the vault and the folders of its machines: `data` for the writer, `reader-<n>` for each reader. */
async function vaulted(t: test.TestContext): Promise<{ app: TestApp; folder: (name: string) => string }> {
  const temp = tempOf(t)
  const app = await testApp({ folder: copyOf(t, 'vaulted'), secrets: { API_KEY: 'the-key-of-the-test' } })
  closing(t, () => app.close())
  const folder = (name: string): string =>
    join(temp, String(readdirSync(temp).find((one) => one.startsWith('tent-test-'))), name)
  return { app, folder }
}

/** How many reads of the vault the log of a machine holds: one handed on from a reader is counted by its writer. */
function readsIn(folder: string): number {
  const log = new DatabaseSync(join(folder, 'logs.db'), { readOnly: true })
  try {
    return log
      .prepare('SELECT * FROM "calls"')
      .all()
      .filter((row) => row.name === 'kept').length
  } finally {
    log.close()
  }
}

const keyOf = (folder: string): string => readFileSync(join(folder, 'secret.key'), 'utf8')

const keep = async (app: TestApp, title: string): Promise<void> => {
  const answer = await app.request(
    new Request(`${origin}/_t/call/keep`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ input: { title, note: `the note of ${title}` } }),
    }),
  )
  assert.equal(Object(await answer.json()).ok, true)
}

const notes = (titles: string[]) => ({
  ok: true,
  value: titles.map((title) => ({ title, note: `the note of ${title}` })),
})

test('[22-14b] a reader that joins again after a new key holds the newly sealed rows, hands a read of them on while it holds the old key, and answers it itself once it is given the new one', async (t) => {
  const { app, folder } = await vaulted(t)
  await keep(app, 'a')
  const near = await app.reader({ secretKey: keyOf(folder('data')) })
  await current(app, near)
  await level(app, near)
  // With the key of its writer the reader opens the sealed rows itself: the writer counts no read.
  const before = readsIn(folder('data'))
  assert.deepEqual(await read(near, 'kept'), notes(['a']))
  assert.equal(readsIn(folder('data')), before)

  // The writer is stopped, its key replaced, and started again: the reader joins again, and is sent every row anew.
  await app.kill()
  await replaceSecretKey(folder('data'))
  await app.restart()
  await keep(app, 'b')
  await current(app, near)
  await level(app, near)
  // Under the old key it opens none of them: the read is handed on, and the writer answers it.
  assert.deepEqual(await read(near, 'kept'), notes(['a', 'b']))
  assert.equal(readsIn(folder('data')), before + 1)

  // Given the new key, as its file laid into its folder before it is started again, it answers by itself.
  const mine = folder('reader-2')
  await near.close()
  writeFileSync(join(mine, 'secret.key'), keyOf(folder('data')))
  await near.restart({ reads: app })
  await current(app, near)
  assert.deepEqual(await read(near, 'kept'), notes(['a', 'b']))
  assert.equal(readsIn(folder('data')), before + 1)
})

test('[22-14b] a reader that is started with the new key laid in its folder seals nothing, takes nothing away, and answers a read of a sealed value under either key', async (t) => {
  const { app, folder } = await vaulted(t)
  await keep(app, 'a')
  const near = await app.reader({ secretKey: keyOf(folder('data')) })
  await current(app, near)
  await level(app, near)
  const mine = folder('reader-2')
  const old = keyOf(mine)
  // The writer is stopped and its key replaced; the reader is started again with the new key laid beside its own.
  await app.kill()
  await replaceSecretKey(folder('data'))
  await near.close()
  writeFileSync(join(mine, 'secret.key.next'), keyOf(folder('data')))
  await near.restart({ reads: app })
  await app.restart()
  await keep(app, 'b')
  await current(app, near)
  await level(app, near)
  await beat(near, 2)
  // Rows sealed under the old key and under the new one: it answers both itself, and the writer counts no read.
  const before = readsIn(folder('data'))
  assert.deepEqual(await read(near, 'kept'), notes(['a', 'b']))
  assert.equal(readsIn(folder('data')), before)
  // It took nothing away and made no key: both files lie in its folder as they were laid.
  assert.equal(keyOf(mine), old)
  assert.equal(readFileSync(join(mine, 'secret.key.next'), 'utf8'), keyOf(folder('data')))
})
