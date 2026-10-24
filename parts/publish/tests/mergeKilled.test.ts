import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { openHistory } from '../../history/index.ts'
import { ada, closing, computer, describedNow, folderOf } from './server.ts'

const child = fileURLToPath(new URL('./held/mergeChild.ts', import.meta.url))
const offline = pathToFileURL(fileURLToPath(new URL('../../../rig/offline.ts', import.meta.url))).href

/** Reads a history file that another program writes, to read alone: whether it holds a merge, and where a pointer stands. */
function seen(folder: string, pointer: string): { merged: boolean; at?: string } {
  const db = new DatabaseSync(join(folder, 'history.db'), { readOnly: true })
  try {
    const merged = db.prepare(`SELECT count(*) AS n FROM points WHERE kind = 'merge'`).get()
    const at = db.prepare('SELECT value FROM pointers WHERE name = ?').get(pointer)
    return { merged: Number(merged?.n ?? 0) > 0, ...(at ? { at: String(at.value) } : {}) }
  } finally {
    db.close()
  }
}

test('[40-21] a server that is killed while it checks the merge of a push leaves the branch where it stood', async (t) => {
  const folder = folderOf(t)
  const here = computer(t, folder, 'here')
  const base = await here.save()
  here.edit('functions/orders.ts', ".limit(input('limit'))", '.limit(50)')
  const pushed = await here.save()
  here.history.write(base, here.project)
  here.history.move('now', base)
  here.edit('tables/orders.ts', '    title: text({ min: 1, max: 80 }),', '    title: text({ min: 1, max: 90 }),')
  const standing = here.history.record(here.project, {
    by: ada,
    kind: 'command',
    checked: true,
    description: await describedNow(here.project),
  }).id
  here.history.move('main', standing)
  const historyFolder = join(here.project, '.tent')

  const program = spawn(process.execPath, ['--import', offline, child, historyFolder, base, standing, pushed], {
    stdio: 'ignore',
  })
  const ended = new Promise<void>((done) => program.on('exit', () => done()))
  t.after(() => {
    if (program.exitCode === null) program.kill()
  })
  // The merge point is written before the check begins: the program is killed at the first sight of it.
  let killed = false
  while (program.exitCode === null) {
    if (seen(historyFolder, 'main').merged) {
      program.kill()
      killed = true
      break
    }
    await new Promise((done) => setTimeout(done, 2))
  }
  await ended
  assert.ok(killed, 'the program was killed while it checked')
  assert.equal(seen(historyFolder, 'main').at, standing, 'the branch stands where it stood')
  const again = openHistory(historyFolder)
  closing(t, () => again.close())
  assert.equal(again.pointer('main'), standing)
})
