import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { appIn, command } from './desks.ts'
import { copyOf } from './projects.ts'

test('[45-1] the removal of a person says that the archive still holds them, as it says how many backups do; with the archive off it says it holds nothing of them', async (t) => {
  for (const archive of [true, false]) {
    const folder = copyOf(t, 'undone')
    if (!archive) {
      const file = join(folder, 'tent.ts')
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace('backups: { every: false },', 'backups: { every: false, archive: false },'),
      )
    }
    const { app, dataFolder } = await appIn(t, folder)
    const ada = await app.user({ name: 'Ada', roles: [] })
    await app.call('addNote', { title: 'a note of Ada' }, { as: ada })
    const said = Object(
      await command(app, dataFolder, 'data', { what: 'user', do: 'remove', id: ada.user?.id, yes: true }),
    )
    assert.equal(said.removed, true)
    assert.equal(said.backups, 0)
    assert.equal(said.archive, archive, 'whether the archive still holds the person, until it is past')
  }
})
