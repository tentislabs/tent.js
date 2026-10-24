import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { writeKey } from '../index.ts'
import { bundled, send } from './apps.ts'
import { addNote, machineAddress, placeTold, rawLink, tags, until, worldOf, writerIn } from './machines.ts'

// Each address of the link, as a reader asks it.
const asks: [string, string, string?][] = [
  ['GET', '/_t/copy/versions'],
  ['GET', '/_t/copy/data'],
  ['GET', '/_t/copy/blob/0123456789abcdef'],
  ['GET', '/_t/copy/file/0123456789abcdef'],
  ['POST', '/_t/copy/took', JSON.stringify({ epoch: '999:zzzz', own: machineAddress.far })],
  ['POST', '/_t/copy/do', JSON.stringify({ name: 'addNote', input: { title: 'x' } })],
  ['GET', '/_t/copy/'],
]

test('[29-11.1@8c] each address of the link asked with a key that holds another right than copy or far is not found, as with no key, and nothing of the data is sent', async (t) => {
  const world = worldOf(t)
  const writer = await world.engine().open((await bundled(t, {}, world.work)).folder, {
    dataFolder: join(world.work, 'writer'),
    mode: 'test',
    address: '*',
    own: machineAddress.writer,
  })
  world.apps[machineAddress.writer] = writer
  await addNote(writer, 'a note nobody else reads')
  const answer = async (method: string, path: string, body: string | undefined, key?: string): Promise<string> => {
    const one = await writer.request(
      new Request(`${machineAddress.writer}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
        ...(body === undefined ? {} : { body }),
      }),
    )
    const text = await one.text()
    assert.equal(text.includes('a note nobody else reads'), false, `${path} sends nothing of the data`)
    return JSON.stringify([one.status, text.replace(/"(id|at|request)":"[^"]*"/g, '')])
  }
  for (const rights of [['read'], ['push'], ['publish'], ['bundle'], ['work'], ['read', 'push', 'publish', 'bundle']]) {
    const { key } = writeKey(writer, { name: rights.join(' '), rights })
    for (const [method, path, body] of asks) {
      const keyed = await answer(method, path, body, key)
      assert.equal(keyed, await answer(method, path, body), `a key of ${rights} at ${path}`)
      assert.match(keyed, /^\[404,/, `a key of ${rights} at ${path} is not found`)
    }
  }
})

test('[29-11.9@8c] the key of a far reader of the right far, taken: it joins as near and states an own address, sends took and a from far ahead, and hands requests on; it is far, no machine dials it, the writer goes on, and its requests stop at handedPerMinute', async (t) => {
  const world = worldOf(t)
  const change = (d: { project: object }) => Object.assign(d.project, { limits: { handedPerMinute: 20 } })
  const writer = await writerIn(world, await bundled(t, { change }, world.work), world.engine())
  const far = writeKey(writer, { name: 'far', rights: ['far'] }).key
  const raw = rawLink(writer, far)
  raw.link.send(placeTold(writer, 'the-far-machine', { far: false, own: 'https://far-attacker.test' }))
  await until('the far key joined', () => raw.got.some((one) => one.t === 'go'))
  const me = writer.machines().find((one) => one.id === 'the-far-machine')
  assert.equal(me?.far, true, 'far whatever it said')
  assert.equal(me?.take, false, 'no machine dials it')
  const newer = `${Number(writer.at().epoch.split('.')[0]) + 1}.the-far-machine`
  const took = await send(writer, 'https://writer.test/_t/copy/took', {
    body: JSON.stringify({ epoch: newer, own: 'https://far-attacker.test' }),
    headers: { authorization: `Bearer ${far}` },
  })
  assert.ok(Object(took.body.value).other, `its took is not believed: ${JSON.stringify(took.body)}`)
  const ahead = rawLink(writer, far)
  ahead.link.send(placeTold(writer, 'the-far-machine-2', { epoch: newer, n: writer.at().n + 1_000_000 }))
  await addNote(writer, 'the writer goes on')
  assert.ok((await tags(writer)).includes('the writer goes on'), 'the writer does not stand back')
  const handed = (i: number) =>
    send(writer, 'https://writer.test/_t/call/whoAmI', {
      from: '10.0.0.9',
      headers: {
        'tent-reader': far,
        'tent-for': '203.0.113.7; https; writer.test',
        'tent-epoch': writer.at().epoch,
        'tent-ref': `ref${String(i).padStart(5, '0')}`,
      },
    })
  for (let i = 0; i < 20; i++) assert.equal((await handed(i)).status, 200, `handed ${i}`)
  assert.deepEqual([(await handed(99)).status, (await handed(98)).error.code], [429, 'T0005'])
})
