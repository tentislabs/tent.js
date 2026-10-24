import assert from 'node:assert/strict'
import test from 'node:test'
import { system } from './apps.ts'
import { modeled } from './modeling.ts'

test('[21-20@9a] `model.fellBack` is heard when a model in fallback answered, with its app, the model asked, the one that answered and why', async (t) => {
  const { app, engine } = await modeled(t)
  const heard: unknown[] = []
  engine.on('model.fellBack', (told) => void heard.push([told.app === app, told.name, told.answeredBy, told.reason]))
  assert.equal(await app.call('writer.reply', ['Hello.'], { as: system }), 'from the backup')
  assert.deepEqual(heard, [[true, 'writer', 'backup', 'unreachable']])
  // A model that answered itself raises nothing.
  assert.equal(await app.call('backup.reply', ['Hello.'], { as: system }), 'from the backup')
  assert.equal(heard.length, 1)
})
