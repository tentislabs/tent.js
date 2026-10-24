import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { storedValues } from '../index.ts'
import type { Answered, Running } from './apps.ts'
import { running, send, system } from './apps.ts'
import { untilTried, watcher } from './watching.ts'

/** Sends a command to the admin channel of an app, as a command of this computer does, with no network. */
function command(run: Running, name: string, args: object): Promise<Answered> {
  const token = String(JSON.parse(readFileSync(join(run.dataFolder, 'engine.json'), 'utf8')).token)
  return send(run.app, `${run.origin}/_t/admin/${name}`, {
    body: JSON.stringify({ args }),
    headers: { authorization: `Bearer ${token}` },
  })
}

test('[22-14a] a setting answers its default until one is set, a setting that was set while the engine runs is used at once and reaches a live query, and a value that does not fit its type is refused', async (t) => {
  const run = await running(t, { project: 'valued' })
  const { app, dataFolder, origin } = run
  // Until a value is set, a setting answers the default of its type, and nothing where its type has none.
  assert.deepEqual(await app.call('shown', {}, { as: system }), { shopName: 'The shop', maxItems: 5, tags: [] })
  assert.equal(existsSync(join(dataFolder, 'settings.test')), false)
  // A page watches the query that reads the settings.
  const page = watcher(app, origin)
  const first = await page.watch('w1', 'shown')
  assert.deepEqual([first.t, first.value], ['result', { shopName: 'The shop', maxItems: 5, tags: [] }])

  // A text is taken as it is typed, and any other type is read as JSON.
  const named = await command(run, 'settings', { do: 'set', name: 'shopName', value: 'The other shop', written: true })
  assert.deepEqual(named.body, { ok: true, value: { name: 'shopName', set: true, value: 'The other shop' } })
  await command(run, 'settings', { do: 'set', name: 'maxItems', value: '20', written: true })
  await command(run, 'settings', { do: 'set', name: 'tags', value: '["new","sale"]', written: true })
  await command(run, 'settings', { do: 'set', name: 'owner', value: 'Maya', written: true })
  // The next call reads the new values.
  const now = { shopName: 'The other shop', maxItems: 20, owner: 'Maya', tags: ['new', 'sale'] }
  assert.deepEqual(await app.call('shown', {}, { as: system }), now)
  // And the page that watches is sent them, with no write to any table.
  await untilTried('the page is sent the new settings', () =>
    page.of('result', 'w1').some((one) => Object(one.value).owner === 'Maya'),
  )
  assert.deepEqual(page.of('result', 'w1').at(-1)?.value, now)

  // The file holds the form of its kind and the values, not encrypted.
  assert.deepEqual(JSON.parse(readFileSync(join(dataFolder, 'settings.test'), 'utf8')), {
    format: 'tent.settings/1',
    values: { maxItems: 20, owner: 'Maya', shopName: 'The other shop', tags: ['new', 'sale'] },
  })
  assert.equal(existsSync(join(dataFolder, 'settings.live')), false)

  // A value that does not fit the type of its setting is refused, and nothing is written.
  for (const [name, value] of [
    ['maxItems', '"many"'],
    ['maxItems', '0'],
    ['maxItems', 'not json'],
    ['tags', '[1,2]'],
    ['open', '"yes"'],
  ]) {
    const refused = await command(run, 'settings', { do: 'set', name, value, written: true })
    assert.deepEqual([refused.body.ok, refused.error.code], [false, 'T0002'], `${name} ${value}`)
  }
  // And so is a name that is no setting of the project.
  const unknown = await command(run, 'settings', { do: 'set', name: 'nothing', value: 'x', written: true })
  assert.deepEqual([unknown.body.ok, unknown.error.code], [false, 'T0002'])
  assert.deepEqual(await app.call('shown', {}, { as: system }), now)

  // The list shows each setting with its value, whether it was set, and whether it is public.
  const listed = Object((await command(run, 'settings', { do: 'list' })).body.value)
  assert.deepEqual(listed.settings, [
    { name: 'maxItems', value: 20, set: true, public: false },
    { name: 'open', value: true, set: false, public: true },
    { name: 'owner', value: 'Maya', set: true, public: false },
    { name: 'shopName', value: 'The other shop', set: true, public: true },
    { name: 'tags', value: ['new', 'sale'], set: true, public: false },
  ])
  // A removal puts the default back, at once.
  const removed = await command(run, 'settings', { do: 'remove', name: 'shopName' })
  assert.deepEqual(removed.body, { ok: true, value: { name: 'shopName', set: false, value: 'The shop' } })
  await command(run, 'settings', { do: 'remove', name: 'owner' })
  assert.deepEqual(await app.call('shown', {}, { as: system }), {
    shopName: 'The shop',
    maxItems: 20,
    tags: ['new', 'sale'],
  })
  page.close()
})

test('[22-14a] with no engine running the settings are written into the file of the folder, each held to its type, and the engine that opens next reads them', async (t) => {
  const run = await running(t, { project: 'valued' })
  const { dataFolder, bundle, engine } = run
  await run.app.close()
  assert.deepEqual(
    storedValues(dataFolder, bundle.description, { kind: 'settings', name: 'maxItems', value: '7', written: true }),
    {
      name: 'maxItems',
      set: true,
      value: 7,
    },
  )
  assert.throws(
    () =>
      storedValues(dataFolder, bundle.description, { kind: 'settings', name: 'maxItems', value: '-1', written: true }),
    {
      code: 'T0002',
    },
  )
  const app = await engine.open(bundle.folder, { dataFolder, mode: 'test' })
  assert.equal(Object(await app.call('shown', {}, { as: system })).maxItems, 7)
})
