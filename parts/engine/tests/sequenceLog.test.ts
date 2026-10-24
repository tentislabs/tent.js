import assert from 'node:assert/strict'
import test from 'node:test'
import { logRows, running } from './apps.ts'
import { scripted } from './followedApp.ts'

test('[27-18] an engine that was handed no reader of source says once, when the app opens, which agents offer no sequence; one that was handed a reader says nothing of it', async (t) => {
  const model = scripted()
  const bare = await running(t, { project: 'told', engine: { makers: { providers: () => ({ mine: model.mine }) } } })
  await bare.app.close()
  const said = logRows(bare.dataFolder, 'lines').filter((row) => String(row.message).startsWith('No reader of source'))
  assert.equal(said.length, 1, JSON.stringify(said))
  assert.match(String(said[0]?.message), /helper/)
  const read = await running(t, {
    project: 'told',
    engine: { makers: { providers: () => ({ mine: model.mine }) }, readBody: () => ({ body: [] }) },
  })
  await read.app.close()
  assert.deepEqual(
    logRows(read.dataFolder, 'lines').filter((row) => String(row.message).startsWith('No reader of source')),
    [],
  )
})
