import assert from 'node:assert/strict'
import { lstatSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fetchPart } from '../index.ts'
import { nobody, refusal, send, workFolder } from './apps.ts'
import type { Packed } from './archives.ts'
import { everythingIn, lineOf, needing, partServer, placeOf, tarOf, tgzOf, wholePath, zipOf } from './archives.ts'

const tool: Packed[] = [
  { path: 'package', folder: true },
  { path: 'package/tool.txt', text: 'the tool' },
  { path: 'package/bin/run', text: '#!/bin/sh\n', mode: 0o755 },
]

/** Holds that a fetch of a part is refused with T0016, and that the message names the part. */
async function notFetched(work: Promise<unknown>, name: string): Promise<void> {
  const error = await refusal(work)
  assert.equal(error.code, 'T0016', error.message)
  assert.ok(error.message.includes(name), `${error.message} does not name ${name}`)
}

test('[22-6] a part is fetched once for two calls at once, and not again once it is there', async (t) => {
  const bytes = tgzOf(tool)
  const server = await partServer(t, { '/tool-1.2.0.tgz': bytes }, 150)
  const folder = workFolder(t)
  const o = {
    list: [lineOf('tool', '1.2.0', `${server.origin}/tool-1.2.0.tgz`, bytes)],
    folder,
    mode: 'development' as const,
  }

  const [one, two] = await Promise.all([fetchPart('tool', o), fetchPart('tool', o)])
  assert.equal(one, placeOf(folder, 'tool', '1.2.0'))
  assert.equal(two, one)
  assert.deepEqual(server.asked, ['/tool-1.2.0.tgz'])
  assert.equal(readFileSync(join(one, 'package', 'tool.txt'), 'utf8'), 'the tool')
  // A file that may be carried out as a program still may, where the system knows such a mark.
  if (process.platform !== 'win32') assert.equal(lstatSync(join(one, 'package', 'bin', 'run')).mode & 0o111, 0o111)

  assert.equal(await fetchPart('tool', o), one)
  assert.deepEqual(server.asked, ['/tool-1.2.0.tgz'])
  // Nothing half-made is left beside the part.
  assert.deepEqual(
    everythingIn(join(folder, 'fetched')).filter((path) => !path.startsWith('tool@1.2.0/')),
    ['.tmp', 'tool@1.2.0'],
  )
})

test('[22-6] a part has one entry for each system where it differs, may be several files, and is unpacked from each kind of archive', async (t) => {
  const own = zipOf([{ path: 'resizer.txt', text: 'the resizer of this system' }])
  const library = tarOf([{ path: 'lib/library.txt', text: 'the library it stands on' }])
  const other = tgzOf([{ path: 'resizer.txt', text: 'the resizer of another system' }])
  const server = await partServer(t, { '/own.zip': own, '/library.tar': library, '/other.tgz': other })
  const folder = workFolder(t)
  const here = `${process.platform}-${process.arch}`
  const list = [
    { ...lineOf('resizer', '0.34.1', `${server.origin}/other.tgz`, other), system: 'plan9-mips' },
    { ...lineOf('resizer', '0.34.1', `${server.origin}/own.zip`, own), system: here },
    { ...lineOf('resizer', '0.34.1', `${server.origin}/library.tar`, library), system: here },
  ]

  const part = await fetchPart('resizer', { list, folder, mode: 'development' })
  assert.deepEqual(server.asked, ['/own.zip', '/library.tar'])
  assert.deepEqual(everythingIn(part), ['lib', 'lib/library.txt', 'resizer.txt'])
  assert.equal(readFileSync(join(part, 'resizer.txt'), 'utf8'), 'the resizer of this system')

  // A part that the list holds for other systems alone, and one that it does not hold, is not fetched.
  await notFetched(
    fetchPart('resizer', { list: list.slice(0, 1), folder: workFolder(t), mode: 'development' }),
    'resizer',
  )
  await notFetched(fetchPart('reader', { list, folder, mode: 'development' }), 'reader')
  // The list that ships holds no part yet.
  await notFetched(fetchPart('a-part-of-no-list', { folder, mode: 'development' }), 'a-part-of-no-list')
})

test('[22-6] a download with a wrong fingerprint, and an archive with a path or a link that leaves its folder, is thrown away, and one with a link that stays inside is taken', async (t) => {
  const folder = workFolder(t)
  const outside = wholePath(folder)
  writeFileSync(join(folder, 'data.txt'), 'what lies beside the parts')
  const leaving: Record<string, Packed[]> = {
    climbs: [{ path: '../escaped.txt', text: 'out' }],
    'climbs-from-inside': [
      { path: 'inner', folder: true },
      { path: 'inner/../../../escaped.txt', text: 'out' },
    ],
    whole: [{ path: `${outside}/escaped.txt`, text: 'out' }],
    'other-slash': [{ path: '..\\escaped.txt', text: 'out' }],
    'link-out': [
      { path: 'kept.txt', text: 'in' },
      { path: 'way', link: '../../..' },
    ],
    'link-whole': [{ path: 'way', link: outside }],
    'link-then-file': [
      { path: 'inner', folder: true },
      { path: 'way', link: 'inner' },
      { path: 'way/escaped.txt', text: 'out' },
    ],
    'link-under-link': [
      { path: 'a', folder: true },
      { path: 'a/up', link: '..' },
      { path: 'a/up/escaped', link: '..' },
    ],
    'hard-link-out': [{ path: 'escaped.txt', hard: '../../../data.txt' }],
  }
  const files: Record<string, Uint8Array> = {}
  for (const [name, entries] of Object.entries(leaving)) {
    files[`/${name}.tgz`] = tgzOf(entries)
    if (!entries.some((entry) => entry.hard !== undefined)) files[`/${name}.zip`] = zipOf(entries)
  }
  const good = tgzOf(tool)
  files['/changed.tgz'] = tgzOf([...tool, { path: 'package/more.txt', text: 'one file more' }])
  const server = await partServer(t, files)
  const before = everythingIn(folder)
  assert.deepEqual(before, ['data.txt'])

  for (const path of Object.keys(files)) {
    const name = path.slice(1).replace('.', '-')
    // The line of the changed download carries the fingerprint of the bytes that were pinned, and not of what arrives.
    const bytes = path === '/changed.tgz' ? good : (files[path] ?? good)
    const list = [lineOf(name, '1.0.0', `${server.origin}${path}`, bytes)]
    await notFetched(fetchPart(name, { list, folder, mode: 'development' }), name)
    // Nothing of it is kept, in its place or anywhere else under the folder of the test.
    assert.deepEqual(everythingIn(folder), ['data.txt', 'fetched', 'fetched/.tmp'], path)
  }
  assert.equal(server.asked.length, Object.keys(files).length)
  assert.equal(readFileSync(join(folder, 'data.txt'), 'utf8'), 'what lies beside the parts')

  // Links that stay inside: to a file beside it, to a link, up and over, to a folder, and a hard link.
  const inside: Packed[] = [
    { path: 'python/bin/python', link: 'python3' },
    { path: 'python/bin/python3', link: './python3.13' },
    { path: 'python/bin/python3.13', text: 'the program', mode: 0o755 },
    { path: 'python/share/program', link: '../bin/python3.13' },
    { path: 'python/lib/v1/readme.txt', text: 'the library' },
    { path: 'python/lib/current', link: 'v1' },
    { path: 'python/bin/again', hard: 'python/bin/python3.13' },
    // A path longer than the hundred bytes that the first form of a tar archive gives one.
    { path: `python/lib/${'d/'.repeat(48)}far.txt`, text: 'far down' },
  ]
  for (const [kind, bytes] of [
    ['tgz', tgzOf(inside)],
    ['zip', zipOf(inside.filter((entry) => entry.hard === undefined))],
  ] as const) {
    const links = await partServer(t, { [`/python.${kind}`]: bytes })
    const list = [lineOf(`python-${kind}`, '3.13.0', `${links.origin}/python.${kind}`, bytes)]
    const part = await fetchPart(`python-${kind}`, { list, folder, mode: 'development' })
    for (const path of ['bin/python', 'bin/python3', 'bin/python3.13', 'share/program'])
      assert.equal(readFileSync(join(part, 'python', path), 'utf8'), 'the program', `${kind} ${path}`)
    assert.equal(readFileSync(join(part, 'python', 'lib', 'current', 'readme.txt'), 'utf8'), 'the library')
    assert.equal(readFileSync(join(part, 'python', 'lib', ...'d'.repeat(48), 'far.txt'), 'utf8'), 'far down')
    if (kind === 'tgz') assert.equal(readFileSync(join(part, 'python', 'bin', 'again'), 'utf8'), 'the program')
    // Where the system lets a program make a link, the link is kept as it was written.
    if (process.platform !== 'win32') {
      assert.ok(lstatSync(join(part, 'python', 'bin', 'python3')).isSymbolicLink())
      assert.equal(readlinkSync(join(part, 'python', 'bin', 'python3')), './python3.13')
      assert.equal(readlinkSync(join(part, 'python', 'lib', 'current')), 'v1')
    }
  }
})

test('[22-6] [21-14@6b] [16-2@6b] with the server switched off the call fails with T0016, with the status 500 at the door, and the app keeps answering', async (t) => {
  const bytes = tgzOf(tool)
  const server = await partServer(t, { '/reader-2.0.0.tgz': bytes })
  const folder = workFolder(t)
  const o = {
    list: [lineOf('reader', '2.0.0', `${server.origin}/reader-2.0.0.tgz`, bytes)],
    folder,
    mode: 'development' as const,
  }
  const { app, origin } = await needing(t, 'test')
  Reflect.set(globalThis, 'partOfTheTest', () => fetchPart('reader', o))
  t.after(() => Reflect.deleteProperty(globalThis, 'partOfTheTest'))
  await server.off()

  await notFetched(fetchPart('reader', o), 'reader')
  await notFetched(app.call('readsPart', {}, { as: nobody }), 'reader')
  const answered = await send(app, `${origin}/_t/call/readsPart`)
  assert.equal(answered.status, 500)
  assert.equal(`${answered.error.code} ${answered.error.name}`, 'T0016 part-not-fetched')
  assert.ok(String(answered.error.message).includes('reader'))

  // Nothing else of the app is affected.
  assert.equal(await app.call('still', {}, { as: nobody }), 'still here')
  assert.deepEqual((await send(app, `${origin}/_t/call/still`)).body, { ok: true, value: 'still here' })
  assert.deepEqual(everythingIn(folder), ['fetched', 'fetched/.tmp'])

  // A failed fetch is not remembered: once the part can be reached, the next call that needs it is answered.
  const back = await partServer(t, { '/reader-2.0.0.tgz': bytes })
  o.list = [lineOf('reader', '2.0.0', `${back.origin}/reader-2.0.0.tgz`, bytes)]
  assert.equal(await app.call('readsPart', {}, { as: nobody }), placeOf(folder, 'reader', '2.0.0'))
})

test('[21-14@6b] on live data a caller is sent the general sentence of T0016', async (t) => {
  const { app, origin } = await needing(t, 'live')
  Reflect.set(globalThis, 'partOfTheTest', () => fetchPart('reader', { list: [], folder: workFolder(t), mode: 'live' }))
  t.after(() => Reflect.deleteProperty(globalThis, 'partOfTheTest'))
  const answered = await send(app, `${origin}/_t/call/readsPart`)
  assert.equal(answered.status, 500)
  assert.equal(answered.error.code, 'T0016')
  assert.equal(answered.error.message, 'A part that is needed could not be fetched.')
})

test("[22-6] an address of the builder's own serves every part, with the fingerprints of the list, and a fetch is waited for no longer than its time", async (t) => {
  const bytes = tgzOf(tool)
  const mirror = await partServer(t, { '/mirror/tool-1.2.0.tgz': bytes, '/wrong/tool-1.2.0.tgz': tgzOf([]) })
  // The address of the list is one of the open internet: on live data nothing but the builder's own is asked.
  const list = [lineOf('tool', '1.2.0', 'https://parts.example.test/files/tool-1.2.0.tgz', bytes)]

  const folder = workFolder(t)
  const part = await fetchPart('tool', { list, folder, mode: 'live', from: `${mirror.origin}/mirror` })
  assert.equal(readFileSync(join(part, 'package', 'tool.txt'), 'utf8'), 'the tool')
  assert.deepEqual(mirror.asked, ['/mirror/tool-1.2.0.tgz'])
  await notFetched(
    fetchPart('tool', { list, folder: workFolder(t), mode: 'live', from: `${mirror.origin}/wrong/` }),
    'tool',
  )

  // The same address, read from the environment.
  const kept = process.env.TENT_PARTS
  t.after(() => {
    if (kept === undefined) delete process.env.TENT_PARTS
    else process.env.TENT_PARTS = kept
  })
  process.env.TENT_PARTS = `${mirror.origin}/mirror/`
  const second = workFolder(t)
  assert.equal(await fetchPart('tool', { list, folder: second, mode: 'live' }), placeOf(second, 'tool', '1.2.0'))

  // A place that answers too late: the call fails at the time of the fetch, and nothing is left.
  const slow = await partServer(t, { '/tool-1.2.0.tgz': bytes }, 3000)
  const third = workFolder(t)
  const started = performance.now()
  await notFetched(fetchPart('tool', { list, folder: third, mode: 'live', from: slow.origin, time: 300 }), 'tool')
  assert.ok(performance.now() - started < 2500)
  assert.deepEqual(everythingIn(third), ['fetched', 'fetched/.tmp'])
})
