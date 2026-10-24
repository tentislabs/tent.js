import assert from 'node:assert/strict'
import { test } from 'node:test'
import { logOf, opened, sharedPython } from './pythonApps.ts'

// A project whose root holds `json.py` and `random.py`: on the path of its Python program they stand first.
const shared = sharedPython('shadow', 'attacksPythonShadow')

/** Answers the error that a promise was refused with: a test reads its code and its words. */
async function refusal(promise: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await promise
  } catch (error) {
    return Object(error)
  }
  return assert.fail('the call was answered')
}

test('[05-14.16] a project file named json.py: our side of the Python program still works, an answer and an error with its trace among it', async (t) => {
  const { app, user, dataFolder } = await opened(t, shared)
  const ada = await user()
  assert.equal(await app.call('plain', {}, { as: ada }), 'plain')
  assert.equal((await refusal(app.call('fails', {}, { as: ada }))).code, 'T7119')
  assert.match(JSON.stringify(logOf(dataFolder, 'errors')), /ValueError: a value that is wrong/)
})

test('[05-14.16] a definition whose file is the json.py of the project is carried out from that file', async (t) => {
  const { app, user } = await opened(t, shared)
  assert.equal(await app.call('named', {}, { as: await user() }), 'the json of the project')
})

test('[05-14.16] a project file named like a part of Python that the standard library loads late, random.py: tent.db() still works', async (t) => {
  const { app, user } = await opened(t, shared)
  await app.write([{ add: 'notes', values: { body: 'one' } }], { as: 'system' })
  assert.deepEqual(await app.call('counted', {}, { as: await user() }), { rows: 1 })
})
