import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { bundled, system, userOf } from './apps.ts'
import { keys, machineAddress, readers, worldOf, writerIn } from './machines.ts'

/** The fingerprint that the row of a file of the data folder of a machine holds. */
function fingerprintOf(dataFolder: string, id: string): string {
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    return String(data.prepare('SELECT "fingerprint" FROM "_t_files" WHERE "id" = ?').get(id)?.fingerprint)
  } finally {
    data.close()
  }
}

test('[29-11.11@7a] /_t/copy/file/ answers the bytes of a file that a row names, to a true key alone, and nothing for one that no row names', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, { project: 'teamPapers' }, world.work))
  const ada = userOf(String(Object(await app.call('addUser', { email: 'ada@example.com' }, { as: system })).id))
  const id = String(await app.call('putText', { words: 'the bytes of a file' }, { as: ada }))
  const fingerprint = fingerprintOf(join(world.work, 'writer'), id)
  const asked = (path: string, key?: string) =>
    app.request(
      new Request(`${machineAddress.writer}${path}`, key ? { headers: { authorization: `Bearer ${key}` } } : {}),
    )
  const held = await asked(`/_t/copy/file/${fingerprint}`, keys.near)
  assert.deepEqual([held.status, await held.text()], [200, 'the bytes of a file'])
  // With no key, and with a key that is none, the address is not there.
  assert.equal((await asked(`/_t/copy/file/${fingerprint}`)).status, 404)
  assert.equal((await asked(`/_t/copy/file/${fingerprint}`, keys.none)).status, 404)
  // A fingerprint that no row names, though it is one of a form that could be.
  assert.equal((await asked(`/_t/copy/file/${'0'.repeat(64)}`, keys.near)).status, 404)
})

test('[29-11.2@7a] in the mode live a request with a true Tent-Reader is carried out as the caller that its own cookie names', async (t) => {
  const world = worldOf(t)
  const bundle = await bundled(t, { project: 'teamPapers' }, world.work)
  const app = await world.engine().open(bundle.folder, {
    dataFolder: join(world.work, 'writer'),
    mode: 'live',
    address: '*',
    own: machineAddress.writer,
    readers,
  })
  world.apps[machineAddress.writer] = app
  const ada = String(Object(await app.call('addUser', { email: 'ada@example.com' }, { as: system })).id)
  const signed = await app.request(
    new Request(`${machineAddress.writer}/_t/call/signIn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: machineAddress.writer },
      body: JSON.stringify({ input: { user: ada } }),
    }),
  )
  const session = signed.headers.getSetCookie()[0]?.split(';')[0]
  assert.ok(session, 'the sign-in set a session')
  const answer = await app.request(
    new Request(`${machineAddress.writer}/_t/read/whoAmI`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: machineAddress.writer,
        cookie: session,
        'tent-reader': keys.near,
        'tent-for': '10.0.0.1; https; writer.test',
        'tent-epoch': app.at().epoch,
      },
      body: JSON.stringify({ input: {}, as: ada }),
    }),
  )
  const wire = Object(await answer.json())
  // The user that the cookie names.
  assert.deepEqual(wire, { ok: true, value: ada }, JSON.stringify(wire))
})
