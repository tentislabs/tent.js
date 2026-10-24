import assert from 'node:assert/strict'
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { tellsCapitalsApart } from '../archive/capitals.ts'
import { unpack } from '../archive/unpack.ts'
import { fetchPart } from '../index.ts'
import { workFolder } from './apps.ts'
import type { Packed } from './archives.ts'
import { lineOf, partServer, placeOf, tarOf, tgzOf, walk, zipOf } from './archives.ts'

// The names of what a test lays beside a part, where a link that leads out would find it: no other test writes them.
const beside = `beside-${process.pid}.txt`
const besideFolder = `beside-${process.pid}`

// The three ways a file of a part is packed.
const packings = [
  ['tar', tarOf],
  ['tgz', tgzOf],
  ['zip', zipOf],
] as const

/**
 * Makes the folder of a test, with a file and a folder beside the place of a part: where the part will stand, and
 * where it is filled. A link that leads one step out of its part finds them, so it is no link that leads nowhere.
 */
function folderWith(t: TestContext): { folder: string; held: string[] } {
  const folder = workFolder(t)
  for (const at of ['fetched', 'fetched/.tmp']) {
    mkdirSync(join(folder, at, besideFolder), { recursive: true })
    writeFileSync(join(folder, at, besideFolder, 'kept.txt'), 'what lies beside the part')
    writeFileSync(join(folder, at, beside), 'what lies beside the part')
  }
  return { folder, held: walk(folder) }
}

/** Fetches a part whose files are those that the test packed, each a line of the list, into a folder of the test. */
async function fetching(t: TestContext, folder: string, name: string, files: Uint8Array[]): Promise<string> {
  const served: Record<string, Uint8Array> = {}
  for (const [at, bytes] of files.entries()) served[`/file-${at}`] = bytes
  const server = await partServer(t, served)
  const list = files.map((bytes, at) => lineOf(name, '1.0.0', `${server.origin}/file-${at}`, bytes))
  try {
    return await fetchPart(name, { list, folder, mode: 'development' })
  } finally {
    await server.off()
  }
}

/** Holds that a part is thrown away with T0016 for the reason that the test names, and that nothing of it is left. */
async function thrownAway(t: TestContext, files: Uint8Array[], why: RegExp, what: string): Promise<void> {
  const { folder, held } = folderWith(t)
  const error: unknown = await fetching(t, folder, 'thrown', files).then(
    (part) => new Error(`the part was taken, at ${part}`),
    (refused: unknown) => refused,
  )
  assert.ok(error instanceof Error)
  assert.equal(Reflect.get(error, 'code'), 'T0016', `${what}: ${error.message}`)
  assert.match(error.message, why, what)
  assert.deepEqual(walk(folder), held, what)
}

/** Holds that a part is taken, that nothing of it lies outside its folder, and that no link of it leads out. */
async function takenInside(t: TestContext, files: Uint8Array[], what: string): Promise<void> {
  const { folder, held } = folderWith(t)
  const part = await fetching(t, folder, 'taken', files)
  const root = realpathSync(part)
  for (const path of walk(part)) {
    const real = realpathSync(join(part, path))
    assert.ok(real === root || real.startsWith(`${root}${sep}`), `${what}: ${path} leads out of the part`)
  }
  const at = relative(folder, part).split(sep).join('/')
  assert.deepEqual(
    walk(folder).filter((path) => path !== at && !path.startsWith(`${at}/`)),
    held,
    what,
  )
}

/** Holds each case of a table, packed in each of the three ways, in one file, and cut into two after its first entries. */
async function eachThrownAway(
  t: TestContext,
  cases: Record<string, { entries: Packed[]; cut?: number }>,
  why: RegExp,
): Promise<void> {
  for (const [what, { entries, cut }] of Object.entries(cases))
    for (const [kind, pack] of packings) {
      if (kind === 'zip' && entries.some((entry) => entry.hard !== undefined)) continue
      await thrownAway(t, [pack(entries)], why, `${kind}, ${what}`)
      if (cut !== undefined)
        await thrownAway(
          t,
          [pack(entries.slice(0, cut)), pack(entries.slice(cut))],
          why,
          `${kind}, in two files, ${what}`,
        )
    }
}

// A folder with a file, a second folder, and a link from the first to the second: each stays inside, and none
// leads to a folder above it.
const inside: Packed[] = [
  { path: 'e/kept.txt', text: 'in e' },
  { path: 'd/kept.txt', text: 'in d' },
  { path: 'd/p', link: '../e' },
]

test('[05-7.19] a link that leads out to a place beside the part and no higher, and one that leads out through a link that itself stays inside, is thrown away', async (t) => {
  await eachThrownAway(
    t,
    {
      'to a file beside the part': { entries: [{ path: 'way', link: `../${beside}` }] },
      'to a folder beside the part': { entries: [{ path: 'way', link: `../${besideFolder}` }] },
      'to a file in a folder beside the part': { entries: [{ path: 'way', link: `../${besideFolder}/kept.txt` }] },
      // Read from the folder of the link, the pieces of this whole path name a file of the part.
      'to a whole path': {
        entries: [
          { path: 'e/kept.txt', text: 'in e' },
          { path: 'way', link: '/e/kept.txt' },
        ],
      },
      'from two folders down': {
        entries: [
          { path: 'a/b/kept.txt', text: 'in' },
          { path: 'a/b/way', link: `../../../${beside}` },
        ],
      },
      'down and out': {
        entries: [
          { path: 'a/kept.txt', text: 'in' },
          { path: 'way', link: `a/../../${beside}` },
        ],
      },
      // Read by its names alone, the way goes down two folders and up two, to a file of the part of that very
      // name. The disk follows `d/p` to `e`, and climbs from there: out of the part.
      'through a link that stays inside': {
        entries: [...inside, { path: beside, text: 'in the part' }, { path: 'way', link: `d/p/../../${beside}` }],
        cut: 4,
      },
      'through two links that stay inside': {
        entries: [...inside, { path: 'q', link: 'd/p' }, { path: 'way', link: `q/../../${besideFolder}` }],
        cut: 3,
      },
      'through a link, to a link that leads out': {
        entries: [...inside, { path: 'out', link: `d/p/../../${beside}` }, { path: 'way', link: 'out' }],
        cut: 4,
      },
    },
    /a link that leads out of the folder of the part/,
  )
})

test('[22-6] a link may lead through another link of the part where it ends inside, as the bundle of a library on macOS is laid', async (t) => {
  // The links are named before what they lead to, and the one that leads through another before that other.
  const bundle: Packed[] = [
    { path: 'Lib.framework/Resources', link: 'Versions/Current/Resources' },
    { path: 'Lib.framework/Lib', link: 'Versions/Current/Lib' },
    { path: 'Lib.framework/Versions/Current', link: 'A' },
    { path: 'Lib.framework/Versions/A/Lib', text: 'the library', mode: 0o755 },
    { path: 'Lib.framework/Versions/A/Resources/Info.plist', text: 'what it is' },
    // Through a link and up again, to what lies beside where the link leads.
    { path: 'Lib.framework/Second', link: 'Versions/Current/../A/Lib' },
  ]
  for (const [kind, pack] of packings)
    for (const files of [[pack(bundle)], [pack(bundle.slice(0, 2)), pack(bundle.slice(2))]]) {
      const { folder } = folderWith(t)
      const part = await fetching(t, folder, 'bundle', files)
      assert.equal(part, placeOf(folder, 'bundle', '1.0.0'))
      const at = join(part, 'Lib.framework')
      assert.equal(readFileSync(join(at, 'Lib'), 'utf8'), 'the library', kind)
      assert.equal(readFileSync(join(at, 'Second'), 'utf8'), 'the library', kind)
      assert.equal(readFileSync(join(at, 'Resources', 'Info.plist'), 'utf8'), 'what it is', kind)
      assert.equal(readFileSync(join(at, 'Versions', 'Current', 'Resources', 'Info.plist'), 'utf8'), 'what it is')
      // Where the system lets a program make a link, each is the link that was written.
      if (process.platform !== 'win32') {
        assert.equal(readlinkSync(join(at, 'Resources')), 'Versions/Current/Resources')
        assert.equal(readlinkSync(join(at, 'Versions', 'Current')), 'A')
        assert.ok(lstatSync(join(at, 'Lib')).isSymbolicLink())
      }
    }
})

test('[05-7.12] a part of several files is laid as one: a path or a link of one file that passes a link of another is held as in one file', async (t) => {
  // A path of the second file lies under the path of a link that the first file names.
  await eachThrownAway(
    t,
    {
      'a file under the link': { entries: [...inside, { path: `d/p/${beside}`, text: 'through' }], cut: 3 },
      'a folder under the link': { entries: [...inside, { path: 'd/p/sub', folder: true }], cut: 3 },
      'a file two folders under the link': { entries: [...inside, { path: 'd/p/a/b/x.txt', text: 'through' }], cut: 3 },
      // The link is named by the second file, and the path under it by the first.
      'a file under a link that a later file names': {
        entries: [
          { path: 'e/kept.txt', text: 'in e' },
          { path: 'd/p/x.txt', text: 'in' },
          { path: 'd/p', link: '../e' },
        ],
        cut: 2,
      },
    },
    /EEXIST|file already exists/,
  )
  await eachThrownAway(
    t,
    { 'a link under the link': { entries: [...inside, { path: 'd/p/again', link: 'kept.txt' }], cut: 3 } },
    /an entry under the path of a link/,
  )
  // A link of the second file that leads through the link of the first, and ends inside, is taken.
  const { folder } = folderWith(t)
  const part = await fetching(t, folder, 'several', [
    tarOf(inside),
    tarOf([
      { path: 'through', link: 'd/p/kept.txt' },
      { path: 'onward', link: 'd/p' },
      { path: 'e/more.txt', text: 'more' },
    ]),
  ])
  assert.equal(readFileSync(join(part, 'through'), 'utf8'), 'in e')
  assert.equal(readFileSync(join(part, 'onward', 'more.txt'), 'utf8'), 'more')
  assert.equal(readFileSync(join(part, 'd', 'p', 'more.txt'), 'utf8'), 'more')
})

test('[05-7.13] a link that leads out through a link whose name the disk reads as the same name is thrown away, and so is a part with two names that the disk it is laid on reads as one', async (t) => {
  // A part is held to the disk it is laid on, which is asked as the engine asks it.
  const apart = await tellsCapitalsApart(workFolder(t))
  // In capitals, and with a letter written as one sign and as two.
  for (const [at, [one, other]] of [
    ['p', 'P'],
    ['é', 'é'],
  ].entries()) {
    const laid: Packed[] = [
      { path: 'e/kept.txt', text: 'in e' },
      { path: 'd/kept.txt', text: 'in d' },
      { path: `d/${one}`, link: '../e' },
      { path: beside, text: 'in the part' },
    ]
    // Where the disk reads the two names as one, the way leads through the link and out. Where it reads two, the
    // way names nothing. Either way the disk is what answers, and the part is thrown away.
    const sameName = process.platform === 'darwin' || (process.platform === 'win32' && at === 0)
    const why = sameName
      ? /a link that leads out of the folder of the part/
      : /a link that the disk cannot follow to an end/
    const through: Packed = { path: 'way', link: `d/${other}/../../${beside}` }
    await thrownAway(t, [tarOf([...laid, through])], why, `in one file, ${other}`)
    await thrownAway(t, [tarOf(laid), tarOf([through])], why, `in two files, ${other}`)
    // An entry under the link by its other name: thrown away where the disk reads the two names as one, and where it
    // reads two, laid as two with nothing outside the part.
    for (const entry of [
      { path: `d/${other}/x.txt`, text: 'through' },
      { path: `d/${other}`, text: 'over' },
      { path: `D/kept.txt`, text: 'beside' },
    ]) {
      if (at === 1 && entry.path.startsWith('D/')) continue
      if (apart) {
        await takenInside(t, [tarOf([...laid, entry])], `in one file, ${entry.path}`)
        await takenInside(t, [zipOf(laid), zipOf([entry])], `in two files, ${entry.path}`)
        continue
      }
      const twice = /two names that a disk reads as one/
      await thrownAway(t, [tarOf([...laid, entry])], twice, `in one file, ${entry.path}`)
      await thrownAway(t, [zipOf(laid), zipOf([entry])], twice, `in two files, ${entry.path}`)
    }
  }
})

test('[05-7.17] a part with a link to the folder it lies in, or to one above it, is thrown away', async (t) => {
  const kept: Packed = { path: 'a/b/kept.txt', text: 'in' }
  await eachThrownAway(
    t,
    {
      'to its own folder, at the top': {
        entries: [
          { path: 'kept.txt', text: 'in' },
          { path: 'way', link: '.' },
        ],
      },
      'to its own folder': { entries: [kept, { path: 'a/b/way', link: '.' }] },
      'to its own folder by its name': { entries: [kept, { path: 'a/b/way', link: '../b' }] },
      'to the folder above': { entries: [kept, { path: 'a/b/up', link: '..' }] },
      'to the top of the part': { entries: [kept, { path: 'a/b/top', link: '../..' }] },
      'to a folder above by its name': { entries: [kept, { path: 'a/b/c/back', link: '../../../a' }] },
      'through a link beside it': {
        entries: [
          kept,
          { path: 'a/c/kept.txt', text: 'in' },
          { path: 'a/c/over', link: '../b/first' },
          { path: 'a/b/first', link: '../c' },
        ],
        cut: 3,
      },
      'through a link far from it': {
        entries: [kept, { path: 'a/b/far', link: '../../m' }, { path: 'm', link: 'a' }],
        cut: 2,
      },
    },
    /a link to the folder it lies in or to one above it/,
  )

  // A link to a folder beside it, below it, and beside a folder above it, leads a walk nowhere twice: it is taken.
  const { folder } = folderWith(t)
  const part = await fetching(t, folder, 'beside', [
    tarOf([
      kept,
      { path: 'a/c/other.txt', text: 'other' },
      { path: 'a/b/beside', link: '../c' },
      { path: 'a/below', link: 'b' },
      { path: 'a/b/d/over', link: '../../c' },
    ]),
  ])
  assert.equal(readFileSync(join(part, 'a', 'b', 'beside', 'other.txt'), 'utf8'), 'other')
  assert.equal(readFileSync(join(part, 'a', 'below', 'kept.txt'), 'utf8'), 'in')
  assert.equal(readFileSync(join(part, 'a', 'b', 'd', 'over', 'other.txt'), 'utf8'), 'other')
})

test('[05-7.18] a part with two entries of one path, an entry under the path of a link, or a hard link that names a link, is thrown away', async (t) => {
  const file: Packed = { path: 'a/name.txt', text: 'the first' }
  await eachThrownAway(
    t,
    {
      'two files': { entries: [file, { path: 'a/name.txt', text: 'the second' }], cut: 1 },
      'two files with the same words': { entries: [file, file], cut: 1 },
      'a file and a link': {
        entries: [file, { path: 'b/kept.txt', text: 'in' }, { path: 'a/name.txt', link: '../b' }],
        cut: 1,
      },
      'a link and a file': {
        entries: [{ path: 'b/kept.txt', text: 'in' }, { path: 'a/name.txt', link: '../b' }, file],
        cut: 2,
      },
      'two links': {
        entries: [
          { path: 'b/kept.txt', text: 'in' },
          { path: 'way', link: 'b' },
          { path: 'way', link: 'b/kept.txt' },
        ],
        cut: 2,
      },
      'a file and a hard link': {
        entries: [file, { path: 'b.txt', text: 'in' }, { path: 'a/name.txt', hard: 'b.txt' }],
        cut: 2,
      },
      'a file and a folder': { entries: [file, { path: 'a/name.txt', folder: true }], cut: 1 },
      'a file under a file': { entries: [file, { path: 'a/name.txt/under.txt', text: 'under' }], cut: 1 },
    },
    /EEXIST|ENOTDIR|file already exists|not a directory/,
  )
  // A hard link names a file of the part. One that names a link, or a path that passes one, names nothing: the
  // hard links are laid before any link is.
  await eachThrownAway(
    t,
    {
      'a hard link to a link to a file': {
        entries: [
          { path: 'f.txt', text: 'in' },
          { path: 'way', link: 'f.txt' },
          { path: 'again', hard: 'way' },
        ],
        cut: 2,
      },
      'a hard link to a link to a folder': { entries: [...inside, { path: 'again', hard: 'd/p' }], cut: 3 },
      'a hard link through a link': { entries: [...inside, { path: 'again', hard: 'd/p/kept.txt' }], cut: 3 },
      'a hard link to nothing': { entries: [{ path: 'again', hard: 'gone.txt' }] },
    },
    /a hard link that names no file of the part/,
  )
  // A hard link to a file that a later file of the part lays is taken, as one to a file of its own is.
  const { folder } = folderWith(t)
  const part = await fetching(t, folder, 'names', [
    tarOf([{ path: 'again', hard: 'lib/f.txt' }]),
    tarOf([
      { path: 'lib/f.txt', text: 'in' },
      { path: 'third', hard: 'lib/f.txt' },
    ]),
  ])
  assert.equal(readFileSync(join(part, 'again'), 'utf8'), 'in')
  assert.equal(readFileSync(join(part, 'third'), 'utf8'), 'in')
})

test('[22-6] a link that the disk cannot follow to an end is thrown away with its part: one to nothing, one to itself, and links in a circle', async (t) => {
  await eachThrownAway(
    t,
    {
      'to nothing': {
        entries: [
          { path: 'kept.txt', text: 'in' },
          { path: 'way', link: 'gone.txt' },
        ],
      },
      'to nothing in a folder that is there': {
        entries: [
          { path: 'a/kept.txt', text: 'in' },
          { path: 'way', link: 'a/gone' },
        ],
      },
      'to itself': { entries: [{ path: 'way', link: 'way' }] },
      'two in a circle': {
        entries: [
          { path: 'a', link: 'b' },
          { path: 'b', link: 'a' },
        ],
        cut: 1,
      },
      'three in a circle, with one that leads into it': {
        entries: [
          { path: 'a', link: 'b' },
          { path: 'b', link: 'c' },
          { path: 'c', link: 'a' },
          { path: 'into', link: 'a' },
        ],
        cut: 2,
      },
      'through a file': {
        entries: [
          { path: 'kept.txt', text: 'in' },
          { path: 'way', link: 'kept.txt/under' },
        ],
      },
      'to a link to nothing': {
        entries: [
          { path: 'first', link: 'second' },
          { path: 'second', link: 'gone' },
        ],
        cut: 1,
      },
    },
    /a link that the disk cannot follow to an end/,
  )
})

test('[05-7.19] a link whose way leaves the folder of the part and comes back in is thrown away: each piece of its way is held, and not its end alone', async (t) => {
  // The folder that is filled is named at random by the fetch, so no archive can write its name. Here the test
  // names it, and hands the files to the laying itself.
  for (const [what, entries] of Object.entries<Packed[]>({
    'out and back in to a file': [
      { path: 'kept.txt', text: 'in' },
      { path: 'way', link: '../filled/kept.txt' },
    ],
    'out and back in to a folder': [
      { path: 'd/kept.txt', text: 'in' },
      { path: 'way', link: '../filled/d' },
    ],
    'from two folders down': [
      { path: 'a/b/kept.txt', text: 'in' },
      { path: 'a/b/way', link: '../../../filled/a/b/kept.txt' },
    ],
    'through a link that stays inside': [...inside, { path: 'way', link: 'd/p/../../filled/e/kept.txt' }],
    'out twice': [
      { path: 'kept.txt', text: 'in' },
      { path: 'way', link: '../../work/filled/kept.txt' },
    ],
  })) {
    const work = join(workFolder(t), 'work')
    const filled = join(work, 'filled')
    mkdirSync(filled, { recursive: true })
    const error: unknown = await unpack([tarOf(entries)], filled, join(work, 'place')).then(
      () => new Error('the part was laid'),
      (refused: unknown) => refused,
    )
    assert.ok(error instanceof Error)
    assert.match(error.message, /a link that leads out of the folder of the part/, what)
    assert.ok(!walk(filled).includes('way') && !walk(filled).includes('a/b/way'), what)
  }
  // The same words where the folder has another name lead to nothing, and are thrown away for that.
  const other = join(workFolder(t), 'other')
  mkdirSync(other)
  await assert.rejects(
    unpack(
      [
        tarOf([
          { path: 'kept.txt', text: 'in' },
          { path: 'way', link: '../filled/kept.txt' },
        ]),
      ],
      other,
      other,
    ),
    /a link that leads out of the folder of the part|a link that the disk cannot follow to an end/,
  )
})

test('[05-7.19] a link whose words hold a backslash is thrown away with its part, on every system', async (t) => {
  await eachThrownAway(
    t,
    {
      'between two pieces': {
        entries: [
          { path: 'e/kept.txt', text: 'in e' },
          { path: 'way', link: 'e\\kept.txt' },
        ],
      },
      'in front, as a whole path': {
        entries: [
          { path: 'e/kept.txt', text: 'in e' },
          { path: 'way', link: '\\e\\kept.txt' },
        ],
      },
      'after a climb': {
        entries: [
          { path: 'a/kept.txt', text: 'in' },
          { path: 'a/way', link: '..\\a\\kept.txt' },
        ],
      },
      'beside a slash': {
        entries: [
          { path: 'a/b/kept.txt', text: 'in' },
          { path: 'way', link: 'a/b\\kept.txt' },
        ],
      },
      'at its end': {
        entries: [
          { path: 'e/kept.txt', text: 'in e' },
          { path: 'way', link: 'e\\' },
        ],
      },
      // A name that holds one is a file of its own name on two of the systems.
      'to a file whose name holds one': {
        entries: [
          { path: 'kept.txt', text: 'in' },
          { path: 'way', link: 'kept\\.txt' },
        ],
        cut: 1,
      },
    },
    /a link whose words hold a backslash/,
  )
})

test('[22-6] a part in which a link leads nowhere is held for one that is not there, and is fetched anew', async (t) => {
  const entries: Packed[] = [
    { path: 'lib/v1/readme.txt', text: 'the library' },
    { path: 'lib/current', link: 'v1' },
    { path: 'bin/tool', text: 'the tool' },
    { path: 'bin/again', link: 'tool' },
  ]
  const bytes = tgzOf(entries)
  const server = await partServer(t, { '/tool.tgz': bytes })
  const list = [lineOf('tool', '1.0.0', `${server.origin}/tool.tgz`, bytes)]
  const first = workFolder(t)
  const part = await fetchPart('tool', { list, folder: first, mode: 'development' })
  assert.equal(await fetchPart('tool', { list, folder: first, mode: 'development' }), part)
  assert.deepEqual(server.asked, ['/tool.tgz'])

  // The runner's folder is moved, and what a link leads to is taken away: the link leads nowhere, and the part is
  // none that is there. It is fetched anew, whole, with nothing of the broken part left in it.
  const second = `${first}-second`
  renameSync(first, second)
  t.after(() => rmSync(second, { recursive: true, force: true }))
  const broken = placeOf(second, 'tool', '1.0.0')
  rmSync(join(broken, 'lib', 'v1'), { recursive: true })
  writeFileSync(join(broken, 'left.txt'), 'of the broken part')
  assert.equal(await fetchPart('tool', { list, folder: second, mode: 'development' }), broken)
  assert.deepEqual(server.asked, ['/tool.tgz', '/tool.tgz'])
  assert.equal(readFileSync(join(broken, 'lib', 'current', 'readme.txt'), 'utf8'), 'the library')
  assert.equal(readFileSync(join(broken, 'bin', 'again'), 'utf8'), 'the tool')
  assert.ok(!walk(broken).includes('left.txt'))
  assert.deepEqual(
    walk(join(second, 'fetched')).filter((path) => !path.startsWith('tool@1.0.0/')),
    ['.tmp', 'tool@1.0.0'],
  )

  // The folder is moved and nothing else. Where a link names its folder by a whole path it leads nowhere now, and
  // the part is fetched anew; where it names it from where it lies, the part stands as it was. Either way it is whole.
  const third = `${first}-third`
  renameSync(second, third)
  t.after(() => rmSync(third, { recursive: true, force: true }))
  const there = await fetchPart('tool', { list, folder: third, mode: 'development' })
  assert.equal(there, placeOf(third, 'tool', '1.0.0'))
  assert.equal(readFileSync(join(there, 'lib', 'current', 'readme.txt'), 'utf8'), 'the library')
  assert.ok(server.asked.length === 2 || server.asked.length === 3)
  // A part that is whole is asked for no more.
  const asked = server.asked.length
  assert.equal(await fetchPart('tool', { list, folder: third, mode: 'development' }), there)
  assert.equal(server.asked.length, asked)
})

test('[22-6] [16-2@6b] every way in which the look at the disk fails is T0016, which names the part and keeps the failure as its cause', async (t) => {
  const entries: Packed[] = [
    { path: 'lib/v1/readme.txt', text: 'the library' },
    { path: 'lib/current', link: 'v1' },
    { path: 'bin/tool', text: 'the tool' },
  ]
  const bytes = tgzOf(entries)
  const server = await partServer(t, { '/tool.tgz': bytes })
  const list = [lineOf('tool', '1.0.0', `${server.origin}/tool.tgz`, bytes)]
  /** Holds that a fetch fails with T0016, names the part, and carries what the system answered as its cause. */
  const failsAsOurs = async (folder: string, what: string): Promise<void> => {
    const error: unknown = await fetchPart('tool', { list, folder, mode: 'development' }).then(
      (part) => new Error(`the part was answered, at ${part}`),
      (refused: unknown) => refused,
    )
    assert.ok(error instanceof Error)
    assert.equal(Reflect.get(error, 'code'), 'T0016', `${what}: ${error.message}`)
    assert.match(error.message, /The part tool could not be fetched/, what)
    assert.match(String(Reflect.get(Object(error.cause), 'code')), /^E[A-Z]+$/, `${what}: ${String(error.cause)}`)
  }

  // A file lies where the part would stand.
  const first = workFolder(t)
  mkdirSync(join(first, 'fetched'))
  writeFileSync(placeOf(first, 'tool', '1.0.0'), 'no folder')
  await failsAsOurs(first, 'a file where the part would stand')
  // A file lies where the parts are kept.
  const second = workFolder(t)
  writeFileSync(join(second, 'fetched'), 'no folder')
  await failsAsOurs(second, 'a file where the parts are kept')
  // A file lies where a part is filled, beside its place.
  const third = workFolder(t)
  mkdirSync(join(third, 'fetched'))
  writeFileSync(join(third, 'fetched', '.tmp'), 'no folder')
  await failsAsOurs(third, 'a file where a part is filled')

  // The two that follow need a system that holds a user to the marks of a folder, and a user who is held to them.
  if (process.platform === 'win32' || process.getuid?.() === 0) return
  // A folder of a part that lies there cannot be read.
  const made = workFolder(t)
  await fetchPart('tool', { list, folder: made, mode: 'development' })
  const fourth = `${made}-unread`
  renameSync(made, fourth)
  const closed = join(placeOf(fourth, 'tool', '1.0.0'), 'lib')
  chmodSync(closed, 0o000)
  t.after(() => {
    chmodSync(closed, 0o755)
    rmSync(fourth, { recursive: true, force: true })
  })
  await failsAsOurs(fourth, 'a folder of the part that cannot be read')

  // A part in which a link leads nowhere cannot be removed: the folder that holds it may not be written.
  const again = workFolder(t)
  await fetchPart('tool', { list, folder: again, mode: 'development' })
  const fifth = `${again}-kept`
  renameSync(again, fifth)
  rmSync(join(placeOf(fifth, 'tool', '1.0.0'), 'lib', 'v1'), { recursive: true })
  chmodSync(join(fifth, 'fetched'), 0o555)
  t.after(() => {
    chmodSync(join(fifth, 'fetched'), 0o755)
    rmSync(fifth, { recursive: true, force: true })
  })
  await failsAsOurs(fifth, 'a broken part that cannot be removed')
})
