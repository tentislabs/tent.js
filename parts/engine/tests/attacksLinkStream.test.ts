import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { App, Frame, Link, Reach } from '../index.ts'
import { bundled, system } from './apps.ts'
import type { World } from './machines.ts'
import { addNote, current, readerIn, tags, worldOf, writerIn } from './machines.ts'

/** What whoever stands in the writer's place does with one change of the stream: the frames that the reader is sent for it. */
type Tamper = (wrote: string, record: Frame) => Frame[]

const asItIs: Tamper = (wrote, record) => [wrote, record]

/**
 * A link that stands between a reader and its writer. Every frame passes as it is, but a change, which travels as
 * a text and then its record: that pair is handed to `tamper`, and the reader is sent what it answers.
 */
function standingBetween(up: Link, tamper: () => Tamper): Link {
  let handler: ((frame: Frame) => void) | undefined
  let closed: (() => void) | undefined
  let over = false
  let held: string | undefined
  const waiting: Frame[] = []
  const give = (frame: Frame): void => void (handler ? handler(frame) : waiting.push(frame))
  up.each(
    (frame) => {
      if (typeof frame === 'string' && Object(JSON.parse(frame)).t === 'wrote') {
        held = frame
        return
      }
      if (typeof frame !== 'string' && held !== undefined) {
        const wrote = held
        held = undefined
        for (const one of tamper()(wrote, frame)) give(one)
        return
      }
      give(frame)
    },
    () => {
      over = true
      closed?.()
    },
  )
  return {
    send: (frame) => up.send(frame),
    each(fn, whenClosed) {
      handler = fn
      closed = whenClosed
      for (const frame of waiting.splice(0)) fn(frame)
      if (over) whenClosed?.()
    },
    close: () => up.close(),
  }
}

/** A writer and a far reader whose link passes through the test, with how often the link was opened. */
interface Tampered {
  world: World
  writer: App
  reader: App
  folder: string
  // What is done with the next changes of the stream.
  tamper: Tamper
  links: number
  fetches(): number
  lost(): string[]
  /** Lets beats pass, with nothing tampered, until the reader holds what the writer holds. Fails where it never does. */
  level(): Promise<void>
}

async function tampered(t: TestContext): Promise<Tampered> {
  const world = worldOf(t)
  const writer = await writerIn(world, await bundled(t, {}, world.work))
  const folder = join(world.work, 'far')
  const made: Tampered = {
    world,
    writer,
    reader: writer,
    folder,
    tamper: asItIs,
    links: 0,
    fetches: () => world.asked['/_t/copy/data'] ?? 0,
    lost: () => readdirSync(folder).filter((name) => name.startsWith('lost.')),
    async level() {
      made.tamper = asItIs
      for (let i = 0; i < 60 && made.reader.at().n !== writer.at().n; i++) await world.beat()
      assert.equal(made.reader.at().n, writer.at().n, 'the reader holds the number of the writer')
      await current(world, made.reader)
    },
  }
  const reach: Reach = (to) => {
    const real = world.reach(to)
    if (!real) return undefined
    return {
      request: (request, o) => real.request(request, o),
      link(request) {
        made.links++
        return standingBetween(real.link(request), () => made.tamper)
      },
    }
  }
  // A far reader: no write of the writer waits for it, so a change that never arrives holds nothing up.
  made.reader = await readerIn(world, 'far', world.engine(), reach)
  await current(world, made.reader)
  await addNote(writer, 'before')
  await made.level()
  return made
}

/** Holds that the reader holds what the writer wrote, and nothing else, in a file with the writer's fingerprint. */
async function sameAsWriter(m: Tampered): Promise<void> {
  assert.deepEqual(await tags(m.reader), await tags(m.writer))
  assert.equal(m.reader.at().sum, m.writer.at().sum)
  // Read from the file itself, beside the engine: no row stands there that the writer did not write.
  const db = new DatabaseSync(join(m.folder, 'data.db'), { readOnly: true })
  try {
    const held = db
      .prepare('SELECT "name" FROM "tags" ORDER BY "name"')
      .all()
      .map((row) => String(row.name))
    assert.deepEqual(held, (await tags(m.writer)).sort())
  } finally {
    db.close()
  }
}

test('[29-11.8] a stream that leaves a number out: the reader closes the link and joins again from the number it holds', async (t) => {
  const m = await tampered(t)
  const [links, fetches] = [m.links, m.fetches()]
  // The first change is kept back, and the one after it is sent on.
  let dropped = 0
  m.tamper = (wrote, record) => (dropped++ === 0 ? [] : [wrote, record])
  await addNote(m.writer, 'left out')
  await addNote(m.writer, 'sent on')
  await m.world.beat()
  assert.ok(dropped >= 2, 'both changes crossed the link, and the first was kept back')
  await m.level()
  assert.ok(m.links > links, 'the reader opened its link again')
  assert.equal(m.fetches(), fetches, 'it joined again from the number it holds, with no fetch')
  assert.deepEqual(m.lost(), [])
  await sameAsWriter(m)
})

test('[29-11.8] a stream that sends a number twice: the reader closes the link and joins again, and holds no row twice', async (t) => {
  const m = await tampered(t)
  const [links, fetches] = [m.links, m.fetches()]
  m.tamper = (wrote, record) => [wrote, record, wrote, record]
  await addNote(m.writer, 'sent twice')
  await m.world.beat()
  await m.level()
  assert.ok(m.links > links, 'the reader opened its link again')
  assert.equal(m.fetches(), fetches)
  assert.deepEqual(
    (await tags(m.reader)).filter((name) => name === 'sent twice'),
    ['sent twice'],
  )
  await sameAsWriter(m)
})

test('[29-11.8] a stream whose sum does not fit: the reader keeps its file and fetches the data anew', async (t) => {
  const m = await tampered(t)
  const fetches = m.fetches()
  // The change is sent on under a fingerprint of another record, as one whose record was changed on the way.
  m.tamper = (wrote, record) => {
    const told: Record<string, unknown> = Object(JSON.parse(wrote))
    const change: Record<string, unknown> = Object(told.change)
    return [JSON.stringify({ ...told, change: { ...change, sum: 'f'.repeat(64) } }), record]
  }
  await addNote(m.writer, 'under a wrong sum')
  await m.world.beat(2)
  await m.level()
  assert.ok(m.fetches() > fetches, 'the reader fetched the data anew')
  assert.equal(m.lost().length, 1, `the file it held is kept beside the data: ${m.lost()}`)
  await sameAsWriter(m)
})

test('[29-11.8] a stream whose record was changed on the way: the reader applies none of it, keeps its file and fetches the data anew', async (t) => {
  const m = await tampered(t)
  const fetches = m.fetches()
  // One byte of the record is turned, and the fingerprint is the one of the true record.
  m.tamper = (wrote, record) => {
    if (typeof record === 'string' || record.length === 0) return [wrote, record]
    const turned = new Uint8Array(record)
    turned[turned.length - 1] ^= 0xff
    return [wrote, turned]
  }
  await addNote(m.writer, 'a record that was changed')
  await m.world.beat(2)
  await m.level()
  assert.ok(m.fetches() > fetches, 'the reader fetched the data anew')
  await sameAsWriter(m)
})

test('[29-11.8] a stream whose rows clash with the rows of the reader: the reader keeps its file and fetches the data anew', async (t) => {
  const m = await tampered(t)
  const fetches = m.fetches()
  const rows: unknown = await m.writer.read({ from: 'tags' }, { as: system })
  const id = String(Object(Object(rows)[0]).id)
  // The row is changed by hand in the file of the reader, beside its engine. Then the writer changes the same row.
  const db = new DatabaseSync(join(m.folder, 'data.db'))
  try {
    db.prepare('UPDATE "tags" SET "name" = ? WHERE "id" = ?').run('written by hand', id)
  } finally {
    db.close()
  }
  await m.writer.write([{ change: 'tags', id, values: { name: 'changed by the writer' } }], { as: system })
  await m.world.beat(2)
  await m.level()
  assert.ok(m.fetches() > fetches, 'the reader fetched the data anew')
  assert.equal(m.lost().length, 1, `the file it held is kept beside the data: ${m.lost()}`)
  assert.equal((await tags(m.reader)).includes('written by hand'), false)
  await sameAsWriter(m)
})

test('[29-11.8] frames of the stream that are none: a text that is no JSON, a message of no kind, and a record with no change before it close the link, and the reader joins again', async (t) => {
  const m = await tampered(t)
  for (const [what, frames] of [
    ['a text that is no JSON', ['{ not json']],
    ['a message of a kind that the table does not give', [JSON.stringify({ t: 'obey', run: 'anything' })]],
    ['a record with no change before it', [new Uint8Array([1, 2, 3])]],
    ['a change with no number', [JSON.stringify({ t: 'wrote', change: {}, settled: 0 }), new Uint8Array(0)]],
  ] as const) {
    const [links, fetches] = [m.links, m.fetches()]
    m.tamper = (wrote, record) => [...frames, wrote, record]
    await addNote(m.writer, `after ${what}`)
    await m.world.beat()
    await m.level()
    assert.ok(m.links > links || m.fetches() > fetches, `${what}: the reader joined again or fetched anew`)
    await sameAsWriter(m)
  }
})
