import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { App, Reach } from '../index.ts'
import type { Bundle } from './apps.ts'
import { bundled, engineOf, portOf, system, workFolder } from './apps.ts'
import { addNote, current, keys, machineAddress, moment, readerIn, readers, worldOf, writerIn } from './machines.ts'

const key = 'n'.repeat(40)

// The machines beat five times a second, so that a reader knows within a second that its writer is gone.
const quick = {
  change: (description: Bundle['description']) => {
    description.project.limits = { ...Object(description.project.limits), beat: 200, behind: 1000 }
  },
}

const addTag = (app: App, name: string): Promise<unknown> =>
  app.write([{ add: 'tags', values: { name } }], { as: system })

const tags = async (app: App): Promise<string[]> =>
  Object(await app.read({ from: 'tags', sort: [{ by: 'createdAt' }] }, { as: system })).map(
    (row: { name: string }) => row.name,
  )

async function until(what: string, holds: () => boolean | Promise<boolean>, ms = 30_000): Promise<void> {
  for (const ends = performance.now() + ms; performance.now() < ends; ) {
    if (await holds()) return
    await new Promise((done) => setTimeout(done, 20))
  }
  assert.fail(`never: ${what}`)
}

test('[29-7] an old writer that is started again with reads before its near reader has taken over, and is told by that reader that the writer is the old writer itself, follows the reader once it has taken over', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, quick, work)
  const [writerData, readerData] = [join(work, 'writer'), join(work, 'reader')]
  // Two machines over the network of this computer, each on a port that the system gave its first start.
  const first = engineOf(t)
  const writer = await first.open(bundle.folder, {
    dataFolder: writerData,
    mode: 'test',
    readers: [key],
    insecure: true,
  })
  const writerAt = `http://127.0.0.1:${portOf(writerData)}`
  const second = engineOf(t)
  const reader = await second.read({ from: writerAt, key, dataFolder: readerData, readers: [key], insecure: true })
  const readerAt = `http://127.0.0.1:${portOf(readerData)}`
  await until('the reader is current', () => reader.at().current)
  for (const name of ['one', 'two', 'three']) await addTag(writer, name)
  assert.equal(reader.at().n, writer.at().n)
  const held = writer.at().n
  // The writer is gone, and its folder is started again as a reader of the near reader at once, on its own port:
  // the near reader has not taken over yet, still names the old writer as its writer, and says so.
  const port = portOf(writerData)
  await first.close()
  const again = engineOf(t, { port })
  const back = await again.read({
    from: readerAt,
    key,
    dataFolder: writerData,
    own: writerAt,
    readers: [key],
    insecure: true,
  })
  assert.equal(back.role, 'reader')
  // It was told an address that leads to itself, some times over, before the near reader knows that its writer is gone.
  await until('the near reader is current no more', () => !reader.at().current)
  // It holds every call it answered, and what it counted as it closed.
  assert.ok(back.at().n >= held, `${back.at().n} holds ${held}`)
  assert.equal(back.at().current, false)
  const took = await reader.takeOver()
  await addTag(reader, 'by the new writer')
  // The old writer finds the machine that took over at the address it was started with, and follows it.
  await until('the old writer follows the machine that took over', () => {
    const at = back.at()
    return at.epoch === took.epoch && at.n === reader.at().n && at.current
  })
  assert.deepEqual(await tags(back), ['one', 'two', 'three', 'by the new writer'])
  // No call it answered is lost. What it counted as it closed, after its links were closed, no reader holds: that
  // alone is kept as lost.
  const lost = readdirSync(writerData).filter((name) => name.startsWith('lost.'))
  assert.ok(
    lost.every((name) => Number(name.split('.')[2]) > held),
    lost.join(' '),
  )
  assert.equal(
    reader.machines().some((one) => one.role === 'reader' && one.own === writerAt),
    true,
  )
})

test('[29-2] two machines that each name the other as the writer are each dialled once in a round by a reader that looks for its writer, which waits its time between two rounds, and follows the one that takes over', async (t) => {
  const world = worldOf(t)
  const first = world.engine()
  const app = await writerIn(world, await bundled(t, {}, world.work), first)
  const near = await readerIn(world, 'near')
  // The far reader reaches the others through the test, which counts the links that it opens.
  const dialled: string[] = []
  const counting: Reach = (to) => {
    const inner = world.reach(to)
    if (!inner) return undefined
    return {
      request: (request, o) => inner.request(request, o),
      link(request) {
        dialled.push(to)
        return inner.link(request)
      },
    }
  }
  const far = await readerIn(world, 'far', world.engine(), counting)
  await current(world, near)
  await current(world, far)
  await addNote(app, 'one')
  // The writer is gone, and its folder is started again as a reader of the near reader, which has not taken over:
  // the near reader names the old writer as the writer, and the old writer names the near reader.
  world.apps[machineAddress.writer] = undefined
  await first.close()
  const back = await world.engine().read({
    from: machineAddress.near,
    key: keys.near,
    dataFolder: join(world.work, 'writer'),
    own: machineAddress.writer,
    readers,
    reach: world.reach,
    address: '*',
  })
  world.apps[machineAddress.writer] = back
  // The far reader loses its link and looks for its writer: each address once, and then it waits for its next round.
  dialled.length = 0
  await world.beat(7)
  const rounds = dialled.length
  await moment(300)
  assert.equal(dialled.length, rounds, 'no address is dialled while the reader waits for its next round')
  assert.ok(rounds <= 7 * 2 * 3, `the far reader opened ${rounds} links in seven beats`)
  assert.equal(far.at().current, false)
  // The near reader takes over, and the far reader follows it at its next round.
  const took = await near.takeOver()
  for (let i = 0; i < 80 && far.at().epoch !== took.epoch; i++) await world.beat()
  assert.equal(far.at().epoch, took.epoch)
  await current(world, far)
  for (let i = 0; i < 80 && back.at().epoch !== took.epoch; i++) await world.beat()
  assert.deepEqual([back.role, back.at().epoch], ['reader', took.epoch])
})

test('[29-2] an old writer that is started again as a reader, and is told that the writer is the old writer itself, opens no link to its own address: in no round of the rounds it makes before the near reader takes over, and in none after', async (t) => {
  const world = worldOf(t)
  const first = world.engine()
  const app = await writerIn(world, await bundled(t, {}, world.work), first)
  const near = await readerIn(world, 'near')
  await current(world, near)
  await addNote(app, 'one')
  // The old writer reaches the others through the test, which keeps each address that it opens a link to.
  const dialled: string[] = []
  const counting: Reach = (to) => {
    const inner = world.reach(to)
    return {
      request: (request, o) => {
        if (!inner) throw new Error(`Nothing is reached at ${to}.`)
        return inner.request(request, o)
      },
      link(request) {
        dialled.push(to)
        if (!inner) throw new Error(`Nothing is reached at ${to}.`)
        return inner.link(request)
      },
    }
  }
  world.apps[machineAddress.writer] = undefined
  await first.close()
  const back = await world.engine().read({
    from: machineAddress.near,
    key: keys.near,
    dataFolder: join(world.work, 'writer'),
    own: machineAddress.writer,
    readers,
    reach: counting,
    address: '*',
  })
  world.apps[machineAddress.writer] = back
  // The near reader has not taken over: round after round it names the old writer as the writer.
  await world.beat(12)
  assert.equal(back.at().current, false)
  assert.ok(dialled.filter((to) => to === machineAddress.near).length > 1, 'the old writer made more rounds than one')
  assert.deepEqual(
    dialled.filter((to) => to === machineAddress.writer),
    [],
    'the old writer opened a link to its own address',
  )
  const took = await near.takeOver()
  for (let i = 0; i < 80 && back.at().epoch !== took.epoch; i++) await world.beat()
  assert.deepEqual([back.role, back.at().epoch], ['reader', took.epoch])
  assert.deepEqual(
    dialled.filter((to) => to === machineAddress.writer),
    [],
  )
})
