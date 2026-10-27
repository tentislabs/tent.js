import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { current, level, readersHeld } from './many.ts'
import { served } from './served.ts'
import { idByEmail, stormed } from './storms.ts'

/** The fingerprints of the sessions of a user, as the data file holds them, read beside the engine. */
function sessionsOf(dataFolder: string, user: string): string[] {
  const data = new DatabaseSync(join(dataFolder, 'data.db'), {
    readOnly: true,
  })
  try {
    const rows = data.prepare('SELECT "fingerprint" FROM "_t_sessions" WHERE "user" = ?').all(user)
    return rows.map((row) => String(row.fingerprint)).sort()
  } finally {
    data.close()
  }
}

test('[32-12] a picture as a user leaves the sessions of that user as they were: the session the engine set into its browser ends with the picture, and no session of a browser of the user is ended for it', async () => {
  const at = await served('shot', {
    change: (folder) => {
      for (const name of ['tent.ts', 'board.tsx']) {
        const file = join(folder, name)
        let written = readFileSync(file, 'utf8').replaceAll('PICTURE_PORT', '9')
        if (name === 'tent.ts')
          written = written.replace('screensPerMinute: 100000', 'screensPerMinute: 100000, sessionsPerUser: 1')
        writeFileSync(file, written)
      }
    },
  })
  const [ada] = Object(await at.app.read({ from: 'users' }, { as: 'system' }))
  const id = String(Object(ada).id)
  // Ada is signed in in a browser of her own.
  at.app.session(id)
  const before = sessionsOf(at.dataFolder, id)
  assert.equal(before.length, 1)
  await at.app.shot('/board', {
    as: id,
    size: { width: 320, height: 200 },
    out: join(at.dataFolder, 'ada.png'),
  })
  // The browser of the picture is gone with the picture: a session that nobody holds is no device of Ada's, and her
  // own browser is still signed in.
  assert.deepEqual(sessionsOf(at.dataFolder, id), before)
})

test(
  '[29-3@5] a browser of a user on a reader of a test app is that user, as on the writer: a test app and its readers are called alike',
  readersHeld,
  async (t) => {
    const { app } = await stormed(t, 'stormed')
    const near = await app.reader()
    await current(app, near)
    const maya = await idByEmail(app, 'maya@example.com')
    await level(app, near)
    assert.deepEqual(await app.browser({ as: maya }).call('whoAmI'), {
      ok: true,
      value: maya,
    })
    assert.deepEqual(await near.browser({ as: maya }).call('whoAmI'), {
      ok: true,
      value: maya,
    })
  },
)
