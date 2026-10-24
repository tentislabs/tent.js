import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { appIn } from './desks.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

/** The code of what a call is refused with, or `none`. */
async function codeOf(work: Promise<unknown>): Promise<string> {
  try {
    await work
    return 'none'
  } catch (error) {
    return String(Reflect.get(Object(error), 'code'))
  }
}

test('[16-2@10e] T2026 and T2028 are each raised by a call built to cause it', async (t) => {
  const { app } = await appIn(t, copyOf(t, 'ruledColumns'))
  const hr = String((await app.user({ name: 'Hana', roles: ['hr'] })).user?.id)
  await app.as(hr).call('addAccount', { email: 'ada@example.com' })
  // A sort and a range on a findable sealed column, which a fingerprint cannot answer.
  assert.equal(await codeOf(app.as(hr).call('sortedEmails', {})), 'T2026')
  assert.equal(await codeOf(app.as(hr).call('emailsAfter', { email: 'b' })), 'T2026')
  // An undo in an app whose archive is off.
  const folder = copyOf(t, 'undone')
  const file = join(folder, 'tent.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace('backups: { every: false },', 'backups: { every: false, archive: false },'),
  )
  const off = await appIn(t, folder)
  const ada = await off.app.user({ name: 'Ada', roles: [] })
  const ids: string[] = []
  for (const title of ['first', 'second', 'third'])
    ids.push(String(Reflect.get(Object(await off.app.call('addNote', { title }, { as: ada })), 'id')))
  const started = await off.app.start('tidy', { rename: ids[0], finish: ids[1], drop: ids[2] }, system)
  assert.ok('run' in started, 'the start was not dropped')
  const { run } = started
  await off.app.runs.wait(run)
  assert.equal(await codeOf(off.app.call('undoRun', { run }, system)), 'T2028')
})
