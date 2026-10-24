import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, sep } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { FetchedPart } from '../index.ts'
import { tellsCapitalsApart } from '../archive/capitals.ts'
import { fetchPart } from '../index.ts'
import { refusal, workFolder } from './apps.ts'
import type { Packed } from './archives.ts'
import { lineOf, partServer, placeOf, tarOf, tgzOf, walk, wholePath, zipOf } from './archives.ts'

// The name of the file that an archive tries to lay outside its folder: no other test, and no other run, writes it.
const mark = `escaped-${process.pid}-${Math.round(performance.timeOrigin)}.txt`

/**
 * Answers where the marked file lies under the folder of a test, but in the part whose path from that folder is
 * given, and in the three folders above it.
 */
function landed(folder: string, part = 'no part'): string[] {
  const above = [dirname(folder), dirname(dirname(folder)), dirname(dirname(dirname(folder)))]
  return [
    ...walk(folder).filter((path) => path.includes(mark) && !path.startsWith(part)),
    ...above.filter((one) => existsSync(join(one, mark))).map((one) => join(one, mark)),
  ]
}

/** Answers each link of a part that the disk follows to a place outside the part. A link that leads nowhere is none. */
function linksOut(part: string): string[] {
  const root = realpathSync(part)
  return walk(part).filter((path) => {
    if (!lstatSync(join(part, path)).isSymbolicLink()) return false
    try {
      const real = realpathSync(join(part, path))
      return real !== root && !real.startsWith(`${root}${sep}`)
    } catch {
      return false
    }
  })
}

/** Holds that a fetch of a part is refused with T0016, and that the message names the part. */
async function thrownAway(work: Promise<unknown>, name: string, what: string): Promise<void> {
  const error = await refusal(work)
  assert.equal(error.code, 'T0016', `${what}: ${error.message}`)
  assert.ok(error.message.includes(name), `${what}: ${error.message} does not name ${name}`)
}

/** Writes the kind of the first entry of a tar archive anew, with the sum of its header. */
function ofKind(tar: Uint8Array, kind: string): Uint8Array {
  const changed = new Uint8Array(tar)
  changed[156] = kind.charCodeAt(0)
  changed.fill(0x20, 148, 156)
  const sum = changed.subarray(0, 512).reduce((all, byte) => all + byte, 0)
  changed.set(new TextEncoder().encode(`${sum.toString(8).padStart(6, '0')}\0 `), 148)
  return changed
}

/** Answers a zip archive of one file, with another path written at one of the two places that name it. */
function zipNaming(listed: string, itself: string): Uint8Array {
  assert.equal(listed.length, itself.length)
  const zip = Buffer.from(zipOf([{ path: 'good/name.txt', text: 'the file' }]))
  zip.write(itself, zip.indexOf('good/name.txt'))
  zip.write(listed, zip.lastIndexOf('good/name.txt'))
  return zip
}

test('[05-7.6] a part whose bytes differ from its fingerprint, and one whose archive holds a path or a link that leaves its folder, is thrown away with T0016', async (t) => {
  const folder = workFolder(t)
  const outside = wholePath(folder)
  writeFileSync(join(folder, 'data.txt'), 'what lies beside the parts')
  const out = { text: 'out' }
  // A file under the other name of a link holds two names that a disk may read as one: such a part is held to the
  // disk it is laid on, which is asked as the engine asks it.
  const capitals: Packed[] = [
    { path: 'inner', folder: true },
    { path: 'way', link: 'inner' },
    { path: `WAY/${mark}`, ...out },
  ]
  const apart = await tellsCapitalsApart(folder)
  const leaving: Record<string, Packed[]> = {
    up: [{ path: `../${mark}`, ...out }],
    'up-alone': [{ path: '..', ...out }],
    'up-folder': [{ path: '..', folder: true }],
    'up-far': [{ path: `../../../../${mark}`, ...out }],
    'from-inside': [{ path: `inner/../../../${mark}`, ...out }],
    'after-a-dot': [{ path: `./../${mark}`, ...out }],
    'through-dots': [{ path: `a/./../../${mark}`, ...out }],
    'two-slashes': [{ path: `a//..//..//${mark}`, ...out }],
    whole: [{ path: `${outside}/${mark}`, ...out }],
    'whole-other-slash': [{ path: `${folder.replaceAll('/', '\\')}\\${mark}`, ...out }],
    'whole-by-its-long-form': [{ path: `\\\\?\\${folder.replaceAll('/', '\\')}\\${mark}`, ...out }],
    'whole-of-a-server': [{ path: `//localhost/share/${mark}`, ...out }],
    'other-slash': [{ path: `..\\${mark}`, ...out }],
    'other-slash-inside': [{ path: `a\\..\\..\\${mark}`, ...out }],
    'both-slashes': [{ path: `a/..\\../${mark}`, ...out }],
    // A path of more than 300 bytes, which goes down far and then climbs out.
    long: [{ path: `${'d/'.repeat(150)}${'../'.repeat(152)}${mark}`, ...out }],
    'link-up': [
      { path: 'kept.txt', text: 'in' },
      { path: 'way', link: '..' },
    ],
    'link-far-up': [{ path: 'way', link: '../../..' }],
    'link-down-and-up': [{ path: 'way', link: 'a/../..' }],
    'link-after-a-dot': [{ path: 'way', link: './..' }],
    'link-over-a-file': [
      { path: 'kept.txt', text: 'in' },
      { path: 'way', link: 'kept.txt/../..' },
    ],
    'link-whole': [{ path: 'way', link: outside }],
    'link-whole-other-slash': [{ path: 'way', link: folder.replaceAll('/', '\\') }],
    'link-to-a-server': [{ path: 'way', link: '//localhost/share' }],
    'link-other-slash': [{ path: 'way', link: '..\\..' }],
    'link-long': [{ path: 'way', link: `${'d/'.repeat(150)}${'../'.repeat(152)}` }],
    'link-to-a-link-out': [
      { path: 'a', link: 'b' },
      { path: 'b', link: 'c' },
      { path: 'c', link: '..' },
    ],
    'link-through-a-link': [
      { path: 'd/up', link: '..' },
      { path: 'way', link: 'd/up/..' },
    ],
    'link-through-a-link-in-capitals': [
      { path: 'd/up', link: '..' },
      { path: 'way', link: 'D/UP/..' },
    ],
    'file-under-a-link': [
      { path: 'inner', folder: true },
      { path: 'way', link: 'inner' },
      { path: `way/${mark}`, ...out },
    ],
    ...(apart ? {} : { 'file-under-a-link-in-capitals': capitals }),
    'link-under-a-link': [
      { path: 'a', folder: true },
      { path: 'a/up', link: '..' },
      { path: 'a/up/way', link: '..' },
    ],
    'link-then-file-of-one-name': [
      { path: 'inner', folder: true },
      { path: 'way', link: 'inner' },
      { path: 'way', ...out },
    ],
    'file-then-link-of-one-name': [
      { path: 'way', ...out },
      { path: 'way', link: '..' },
    ],
    'two-links-of-one-name': [
      { path: 'inner', folder: true },
      { path: 'way', link: 'inner' },
      { path: 'way', link: '..' },
    ],
    'links-in-a-circle': [
      { path: 'a', link: 'b/..' },
      { path: 'b', link: 'a/..' },
    ],
    'hard-link-out': [{ path: mark, hard: '../../../data.txt' }],
    'hard-link-whole': [{ path: mark, hard: `${outside}/data.txt` }],
    'hard-link-other-slash': [{ path: mark, hard: '..\\..\\..\\data.txt' }],
    'hard-link-through-a-link': [
      { path: 'd/f', text: 'in' },
      { path: 'way', link: 'd' },
      { path: 'again', hard: 'way/f' },
    ],
    'hard-link-of-a-link': [
      { path: 'f', text: 'in' },
      { path: 'way', link: 'f' },
      { path: 'again', hard: 'way' },
    ],
  }
  const files: Record<string, Uint8Array> = {}
  for (const [name, entries] of Object.entries(leaving)) {
    files[`/${name}.tar`] = tarOf(entries)
    files[`/${name}.tgz`] = tgzOf(entries)
    if (!entries.some((entry) => entry.hard !== undefined)) files[`/${name}.zip`] = zipOf(entries)
  }
  // A device, a device of blocks and a pipe: a part holds none, whatever its path.
  for (const kind of ['3', '4', '6']) files[`/device-${kind}.tar`] = ofKind(tarOf([{ path: 'device', text: '' }]), kind)
  // A zip archive whose list names a path that leaves, while the entry itself names a good one.
  files['/zip-list-leaves.zip'] = zipNaming('../../evil.tx', 'good/name.txt')

  const good = tgzOf([{ path: 'package/tool.txt', text: 'the tool' }])
  const pinned: Record<string, Uint8Array> = {}
  // Other bytes than the fingerprint pins: another archive, one byte more, one byte fewer, one bit, and nothing.
  const differing: Record<string, Uint8Array> = {
    another: tgzOf([{ path: 'package/tool.txt', text: 'another tool' }]),
    longer: Buffer.concat([good, new Uint8Array(1)]),
    shorter: good.subarray(0, good.length - 1),
    'one-bit': good.map((byte, at) => (at === good.length - 9 ? byte ^ 1 : byte)),
    empty: new Uint8Array(0),
  }
  for (const [name, bytes] of Object.entries(differing)) {
    files[`/differs-${name}.tgz`] = bytes
    pinned[`/differs-${name}.tgz`] = good
  }
  const server = await partServer(t, files)

  for (const [path, bytes] of Object.entries(files)) {
    const name = path.slice(1).replace('.', '-')
    const list = [lineOf(name, '1.0.0', `${server.origin}${path}`, pinned[path] ?? bytes)]
    await thrownAway(fetchPart(name, { list, folder, mode: 'development' }), name, path)
    // Nothing of it is kept: not in its place, not beside it, and not above the folder of the test.
    assert.deepEqual(walk(folder), ['data.txt', 'fetched', 'fetched/.tmp'], path)
    assert.deepEqual(landed(folder), [], path)
  }
  assert.equal(server.asked.length, Object.keys(files).length)
  // Where the disk tells the two names apart they are two, and the part is laid with nothing outside its folder.
  if (apart) assert.ok(await heldInside(t, 'capitals', [tarOf(capitals)], 'file-under-a-link-in-capitals'))
  assert.equal(readFileSync(join(folder, 'data.txt'), 'utf8'), 'what lies beside the parts')

  // An answer that is no success is no part, though its bytes are the pinned ones.
  const refusing = createServer((_request, response) => response.writeHead(404).end(good))
  await new Promise<void>((done) => refusing.listen(0, '127.0.0.1', done))
  t.after(() => new Promise((done) => refusing.close(done)))
  const at = refusing.address()
  assert.ok(at !== null && typeof at === 'object')
  const list = [lineOf('unfound', '1.0.0', `http://127.0.0.1:${at.port}/tool.tgz`, good)]
  await thrownAway(fetchPart('unfound', { list, folder, mode: 'development' }), 'unfound', 'an answer of 404')
  assert.deepEqual(walk(folder), ['data.txt', 'fetched', 'fetched/.tmp'])
})

/**
 * Fetches a part of the files that a test packed, and holds what must hold of every archive: the part is thrown
 * away with T0016, or it is taken with nothing written outside its folder and no link that leads out of it.
 * Answers the folder of the part where it was taken.
 */
async function heldInside(
  t: TestContext,
  name: string,
  files: Uint8Array[],
  what: string,
): Promise<string | undefined> {
  const folder = workFolder(t)
  const served: Record<string, Uint8Array> = {}
  for (const [at, bytes] of files.entries()) served[`/file-${at}`] = bytes
  const server = await partServer(t, served)
  const list = files.map((bytes, at) => lineOf(name, '1.0.0', `${server.origin}/file-${at}`, bytes))
  const part = await fetchPart(name, { list, folder, mode: 'development' }).catch((error: unknown) => error)
  await server.off()
  const outside = landed(folder, `fetched/${name}@1.0.0/`)
  assert.deepEqual(outside, [], `${what}: a file of the archive lies outside the folder of the part`)
  if (typeof part !== 'string') {
    await thrownAway(Promise.reject(part), name, what)
    return undefined
  }
  assert.deepEqual(linksOut(part), [], `${what}: a link of the part leads out of its folder`)
  assert.deepEqual(
    walk(folder).filter((path) => !path.startsWith(`fetched/${name}@1.0.0`)),
    ['fetched', 'fetched/.tmp'],
    what,
  )
  return part
}

test('[05-7.6] an archive with a name that a system reads in its own way, two entries of one name, or two lists that differ, lays nothing outside its folder', async (t) => {
  const odd = [
    'NUL',
    'CON',
    'COM1',
    'aux.txt',
    `sub/NUL/${mark}`,
    `kept.txt:${mark}`,
    `.. /${mark}`,
    `..​/${mark}`,
    `.../${mark}`,
    `..a/${mark}`,
    `a/..b/${mark}`,
    `~/${mark}`,
    `%TEMP%/${mark}`,
    `$HOME/${mark}`,
    `${mark}.`,
    `${mark} `,
    // One name of 300 characters, which no system of the three holds.
    `${'x'.repeat(300)}${mark}`,
    // A path of 300 characters, which every system holds.
    `${'d/'.repeat(140)}${mark}`,
  ]
  for (const [at, path] of odd.entries())
    for (const [kind, bytes] of [
      ['tar', tarOf([{ path, text: 'out' }])],
      ['zip', zipOf([{ path, text: 'out' }])],
    ] as const)
      await heldInside(t, `odd-${kind}-${at}`, [bytes], `${kind} ${JSON.stringify(path)}`)

  // Two entries of one name: the part holds one file of that name, and it is the one that came last.
  const twice = await heldInside(
    t,
    'twice',
    [
      tarOf([
        { path: 'name.txt', text: 'the first' },
        { path: 'name.txt', text: 'the second' },
      ]),
    ],
    'two entries of one name',
  )
  if (twice !== undefined) assert.equal(readFileSync(join(twice, 'name.txt'), 'utf8'), 'the second')
  await heldInside(
    t,
    'folder-and-file',
    [
      tarOf([
        { path: 'name', text: 'a file' },
        { path: 'name', folder: true },
        { path: `name/${mark}`, text: 'out' },
      ]),
    ],
    'a file and a folder of one name',
  )
  // The entry itself names a path that leaves, and the list a good one: the part is what one of them says, inside.
  const listed = await heldInside(t, 'two-lists', [zipNaming('good/name.txt', '../../evil.tx')], 'a zip of two lists')
  if (listed !== undefined) assert.deepEqual(walk(listed), ['good', 'good/name.txt'])
  // A link to the folder itself, which a program that walks the part would follow without end, stays inside.
  await heldInside(
    t,
    'to-itself',
    [
      tarOf([
        { path: 'kept.txt', text: 'in' },
        { path: 'way', link: '.' },
      ]),
    ],
    'a link to the folder itself',
  )
})

test('[05-7.6] a part of several files, where a link of one file leads out through a link of another, is thrown away', async (t) => {
  // Read alone, each file stays inside: the first holds a link to the top of the part, and the second a link that
  // goes down into a folder and one step up. On the disk the folder of the second is the link of the first.
  const up = tarOf([{ path: 'd/p', link: '..' }])
  const through = tarOf([{ path: 'x', link: 'd/p/..' }])
  await heldInside(t, 'two-files', [up, through], 'a link out through the link of another file')
  // A third file is then written through that link.
  const written = tarOf([{ path: `x/${mark}`, text: 'out' }])
  await heldInside(t, 'three-files', [up, through, written], 'a file written out through the links of two others')
})

test('[05-7.6] a link that leads out through a link whose name the disk reads as the same name is thrown away, on macOS', async (t) => {
  // Two ways to write one name, which a disk of macOS takes for one and the two other systems for two: the letter
  // with its mark in one sign and in two, and two signs that fold to one letter.
  for (const [at, [one, other]] of [
    ['é', 'é'],
    ['σ', 'ς'],
    ['s', 'ſ'],
  ].entries())
    await heldInside(
      t,
      `one-name-${at}`,
      [
        tarOf([
          { path: `d/${one}`, link: '..' },
          { path: 'way', link: `d/${other}/..` },
        ]),
      ],
      `a link through d/${other}, where d/${one} is a link`,
    )
})

/** Answers the paths that a part of the given entries holds once it is whole. */
function wholeOf(entries: Packed[]): string[] {
  const paths = new Set<string>()
  for (const entry of entries) {
    const pieces = entry.path.split('/')
    for (let k = 1; k <= pieces.length; k++) paths.add(pieces.slice(0, k).join('/'))
  }
  return [...paths].sort()
}

/** What a program that fetched a part left: how it ended, and what it wrote. */
interface Ended {
  code: number | null
  out: string
  told: string
}

/** Starts a program of its own that fetches a part. It is ended with the test, by its own handle, where it still runs. */
function fetching(
  t: TestContext,
  name: string,
  list: FetchedPart[],
  folder: string,
): { kill(): void; ended: Promise<Ended> } {
  const program = fileURLToPath(new URL('./fetches/program.ts', import.meta.url))
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const child = spawn(process.execPath, [program, name, JSON.stringify(list), folder], { env })
  t.after(() => void child.kill('SIGKILL'))
  let [out, told] = ['', '']
  child.stdout.on('data', (piece) => {
    out += String(piece)
  })
  child.stderr.on('data', (piece) => {
    told += String(piece)
  })
  const ended = new Promise<Ended>((done) => child.once('close', (code) => done({ code, out: out.trim(), told })))
  // A program that never ends is ended here, so that the test ends.
  const timer = setTimeout(() => child.kill('SIGKILL'), 60_000)
  void ended.then(() => clearTimeout(timer))
  return { kill: () => void child.kill('SIGKILL'), ended }
}

test('[05-7.7] programs that fetch one part at once leave one whole part', async (t) => {
  const entries: Packed[] = Array.from({ length: 300 }, (_, k) => ({
    path: `tool/${k % 10}/file-${k}.txt`,
    text: `the file ${k}`,
  }))
  const bytes = tgzOf(entries)
  const server = await partServer(t, { '/tool.tgz': bytes }, 300)
  const folder = workFolder(t)
  const list = [lineOf('tool', '1.0.0', `${server.origin}/tool.tgz`, bytes)]
  const place = placeOf(folder, 'tool', '1.0.0')

  const programs = [1, 2, 3].map(() => fetching(t, 'tool', list, folder))
  const ends = await Promise.all(programs.map((one) => one.ended))
  // Each program is answered the one folder, and each asked for the file itself: they share no memory.
  for (const end of ends) assert.equal(`${end.code} ${end.out}`, `0 ${place}`, end.told)
  assert.equal(server.asked.length, 3)
  assert.deepEqual(walk(place), wholeOf(entries))
  for (const k of [0, 150, 299])
    assert.equal(readFileSync(join(place, `tool/${k % 10}/file-${k}.txt`), 'utf8'), `the file ${k}`)
  // Nothing half-made is left beside it.
  assert.deepEqual(readdirSync(join(folder, 'fetched')).sort(), ['.tmp', 'tool@1.0.0'])
  assert.deepEqual(readdirSync(join(folder, 'fetched', '.tmp')), [])
})

test('[05-7.7] a program that is killed half-way through a fetch leaves no part, and the next fetch leaves one whole part', async (t) => {
  const entries: Packed[] = Array.from({ length: 1500 }, (_, k) => ({
    path: `tool/${k % 30}/file-${k}.txt`,
    text: `the file ${k}`,
  }))
  const bytes = tgzOf(entries)
  const good = await partServer(t, { '/tool.tgz': bytes })
  const whole = wholeOf(entries)

  // Killed while the file arrives: the server sends the first half of it and then nothing.
  let arrived = (): void => undefined
  const half = new Promise<void>((done) => {
    arrived = done
  })
  const halting = createServer((_request, response) => {
    response.writeHead(200, { 'content-length': String(bytes.length) })
    response.write(bytes.subarray(0, bytes.length >> 1), () => arrived())
  })
  await new Promise<void>((done) => halting.listen(0, '127.0.0.1', done))
  t.after(async () => {
    halting.closeAllConnections()
    await new Promise((done) => halting.close(done))
  })
  const at = halting.address()
  assert.ok(at !== null && typeof at === 'object')
  const first = workFolder(t)
  const place = placeOf(first, 'tool', '1.0.0')
  const halted = fetching(t, 'tool', [lineOf('tool', '1.0.0', `http://127.0.0.1:${at.port}/tool.tgz`, bytes)], first)
  await Promise.race([half, halted.ended])
  await new Promise((done) => setTimeout(done, 200))
  halted.kill()
  assert.notEqual((await halted.ended).code, 0)
  assert.equal(existsSync(place), false)
  const list = [lineOf('tool', '1.0.0', `${good.origin}/tool.tgz`, bytes)]
  assert.equal(await fetchPart('tool', { list, folder: first, mode: 'development' }), place)
  assert.deepEqual(walk(place), whole)

  // Killed while the folder is filled: the program is ended once a part of the files lies beside the place.
  const second = workFolder(t)
  const filled = placeOf(second, 'tool', '1.0.0')
  const beside = join(second, 'fetched', '.tmp')
  const unpacking = fetching(t, 'tool', list, second)
  let over = false
  void unpacking.ended.then(() => {
    over = true
  })
  const lies = (): number => {
    try {
      const [made] = readdirSync(beside)
      return made === undefined ? 0 : readdirSync(join(beside, made, 'tool')).length
    } catch {
      return 0
    }
  }
  for (let tries = 0; tries < 20_000 && !over && lies() < 5; tries++) await new Promise((done) => setTimeout(done, 1))
  unpacking.kill()
  await unpacking.ended
  // One whole part, or none: where the program was faster than the test, the part is there, and it is whole.
  if (existsSync(filled)) assert.deepEqual(walk(filled), whole)
  assert.equal(await fetchPart('tool', { list, folder: second, mode: 'development' }), filled)
  assert.deepEqual(walk(filled), whole)
  assert.equal(readFileSync(join(filled, 'tool/29/file-1499.txt'), 'utf8'), 'the file 1499')
  // What the killed program left lies beside the part, and nowhere else.
  assert.deepEqual(readdirSync(join(second, 'fetched')).sort(), ['.tmp', 'tool@1.0.0'])
})
