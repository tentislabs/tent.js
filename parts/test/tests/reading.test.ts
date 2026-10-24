import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { crc32, deflateRawSync } from 'node:zlib'
import { buildProject } from '../../build/index.ts'
import type { ChangeSink, FileStore, Makers, Searcher, TextReader } from '../../engine/index.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'
import type { Siege } from './sieges.ts'
import { asSystem, besieged } from './sieges.ts'
import { pdfStandIn, standIn } from './standIns.ts'

const opened = async (t: TestContext): Promise<TestApp> => {
  const app = await testApp({ folder: copyOf(t, 'reading'), secrets: { SCAN_KEY: 'key-of-the-scanner' } })
  closing(t, () => app.close())
  return app
}

const base64 = (bytes: string | Uint8Array): string => Buffer.from(bytes).toString('base64')

/** A pack of files as a `.docx` is one: each entry packed, with the list of the entries at its end. */
function packed(entries: Record<string, string | Uint8Array>): Uint8Array {
  const parts: Buffer[] = []
  const list: Buffer[] = []
  let at = 0
  for (const [name, content] of Object.entries(entries)) {
    const [named, plain] = [Buffer.from(name), Buffer.from(content)]
    const held = deflateRawSync(plain)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(8, 8)
    head.writeUInt32LE(crc32(plain) >>> 0, 14)
    head.writeUInt32LE(held.length, 18)
    head.writeUInt32LE(plain.length, 22)
    head.writeUInt16LE(named.length, 26)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(8, 10)
    entry.writeUInt32LE(crc32(plain) >>> 0, 16)
    entry.writeUInt32LE(held.length, 20)
    entry.writeUInt32LE(plain.length, 24)
    entry.writeUInt16LE(named.length, 28)
    entry.writeUInt32LE(at, 42)
    parts.push(head, named, held)
    list.push(entry, named)
    at += 30 + named.length + held.length
  }
  const listed = Buffer.concat(list)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(listed.length, 12)
  end.writeUInt32LE(at, 16)
  return new Uint8Array(Buffer.concat([...parts, listed, end]))
}

/** A Word document of some paragraphs, as its one file of words holds them. */
const docxOf = (paragraphs: string[]): Uint8Array =>
  packed({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs
      .map((one) => `<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t xml:space="preserve">${one}</w:t></w:r></w:p>`)
      .join('')}</w:body></w:document>`,
  })

const wordKind = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

test('[22-22] files.text reads each built-in kind: plain text, Markdown, CSV and JSON as they are, the words of HTML, and a line for each paragraph of a Word document', async (t) => {
  const app = await opened(t)
  const maya = await app.user({ email: 'maya@example.com', roles: [] })
  const put = async (bytes: string | Uint8Array, name: string, kind?: string): Promise<string> =>
    String(await app.as(maya).call('keep', { base64: base64(bytes), name, ...(kind === undefined ? {} : { kind }) }))
  const read = async (id: string): Promise<string> => String(await app.as(maya).call('words', { id }))

  // Taken as they are: UTF-8, with a leading byte-order mark removed, and a byte that is no UTF-8 replaced.
  assert.equal(await read(await put('﻿héllo, wörld\nsecond line', 'a.txt', 'text/plain')), 'héllo, wörld\nsecond line')
  assert.equal(await read(await put('# Title\n\nSome *words*.', 'a.md', 'text/markdown')), '# Title\n\nSome *words*.')
  assert.equal(await read(await put('name,total\nAda,3\n', 'a.csv', 'text/csv')), 'name,total\nAda,3\n')
  assert.equal(await read(await put('{"a":[1,2]}', 'a.json', 'application/json')), '{"a":[1,2]}')
  assert.equal(await read(await put(new Uint8Array([0x61, 0xff, 0x62]), 'odd.txt', 'text/plain')), 'a�b')
  // The ending of the name decides where the kind says nothing.
  assert.equal(await read(await put('by its name', 'named.md')), 'by its name')

  // HTML: the words only.
  const page = `<!doctype html><html><head><title>Not a word</title><style>p { color: red }</style></head>
    <body><script>alert('never')</script><h1>Orders &amp; bills</h1><p>Caf&eacute; &#233;t&#xE9; &lt;3<br>second
    line</p><ul><li>one</li><li>two</li></ul></body></html>`
  const words = await read(await put(page, 'a.html'))
  assert.deepEqual(
    words.split('\n').filter((line) => line !== ''),
    ['Orders & bills', 'Café été <3', 'second line', 'one', 'two'],
  )
  for (const never of ['Not a word', 'color', 'alert']) assert.equal(words.includes(never), false, never)

  // Word: each paragraph is a line.
  const document = docxOf(['The first paragraph.', 'Fish &amp; chips', ''])
  assert.equal(await read(await put(document, 'a.docx', wordKind)), 'The first paragraph.\nFish & chips\n')
  // What was read is kept: the same file is read again from what was kept.
  assert.equal(await read(await put(document, 'again.docx', wordKind)), 'The first paragraph.\nFish & chips\n')
})

test('[22-22] an unknown kind fails with T0015, a caller who may not download a file may not read its words, a packed file that opens huge is stopped, and full access reads any file', async (t) => {
  const app = await opened(t)
  const maya = await app.user({ email: 'maya@example.com', roles: [] })
  const omar = await app.user({ email: 'omar@example.com', roles: [] })
  const put = async (bytes: string | Uint8Array, name: string, kind?: string): Promise<string> =>
    String(await app.as(maya).call('keep', { base64: base64(bytes), name, ...(kind === undefined ? {} : { kind }) }))
  const unknown = await put(new Uint8Array([1, 2, 3, 4]), 'model.bin', 'application/x-model')
  await assert.rejects(app.as(maya).call('words', { id: unknown }), (error: { code?: string; message?: string }) => {
    assert.equal(error.code, 'T0015')
    assert.match(String(error.message), /application\/x-model/)
    return true
  })
  // The rule of a download holds for the words of a file: another caller finds no such file, and no file is T0001 too.
  const mine = await put('the words of Maya', 'mine.txt', 'text/plain')
  await assert.rejects(app.as(omar).call('words', { id: mine }), { code: 'T0001' })
  await assert.rejects(app.as(maya).call('words', { id: '01aaaaaaaaaaaaaaaaaaaaaaaa' }), { code: 'T0001' })
  assert.equal(await app.as(omar).call('wordsAsSystem', { id: mine }), 'the words of Maya')
  // A Word document that is no pack of files cannot be read, and the app goes on.
  await assert.rejects(app.as(maya).call('words', { id: await put('no pack at all', 'broken.docx', wordKind) }), {
    code: 'T0015',
  })
  assert.equal(await app.as(maya).call('words', { id: mine }), 'the words of Maya')
  // A small file that opens huge is stopped at `limits.readSize`, which is 1 MB here.
  const huge = docxOf(['x'.repeat(3 * 1024 * 1024)])
  assert.ok(huge.length < 20_000, 'the pack is small')
  await assert.rejects(app.as(maya).call('words', { id: await put(huge, 'huge.docx', wordKind) }), { code: 'T0003' })
})

test('[22-22] a PDF is read after its part is fetched: its pages come in order, each ended by a page mark', async (t) => {
  // A reader of PDF files stands in for the one that is fetched: a page of its files is what stands before `%%EOP`.
  standIn(t, 'unpdf', pdfStandIn)
  const app = await opened(t)
  const maya = await app.user({ email: 'maya@example.com', roles: [] })
  const pdf = '%PDF-1.4\nthe first page%%EOP the second page%%EOP the third page%%EOP'
  const id = String(await app.as(maya).call('keep', { base64: base64(pdf), name: 'a.pdf' }))
  const words = String(await app.as(maya).call('words', { id }))
  assert.equal(words, 'the first page\fthe second page\fthe third page\f')
})

test('[22-22] a reader in engine.ts is used for its kinds, before ours, and a maker is handed the secrets of the app', async (t) => {
  const app = await opened(t)
  const maya = await app.user({ email: 'maya@example.com', roles: [] })
  const put = async (bytes: string | Uint8Array, name: string, kind?: string): Promise<string> =>
    String(await app.as(maya).call('keep', { base64: base64(bytes), name, ...(kind === undefined ? {} : { kind }) }))
  // An exact kind that the reader lists, read with the secret that its maker opened.
  const scan = await put(new Uint8Array([9, 9, 9]), 'page.scan', 'application/x-scan')
  assert.equal(
    await app.as(maya).call('words', { id: scan }),
    'scanned page.scan (application/x-scan, 3 bytes) with key-of-the-scanner',
  )
  // A kind that ends in `/*`: every picture.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  assert.match(
    String(await app.as(maya).call('words', { id: await put(png, 'shot.png') })),
    /^scanned shot\.png \(image\/png, 12 bytes\)/,
  )
  // A kind that it does not list is read by ours.
  assert.equal(await app.as(maya).call('words', { id: await put('plain words', 'a.txt', 'text/plain') }), 'plain words')
  // The description names the module of the makers, which lies in the bundle.
  const built = await buildProject(copyOf(t, 'reading'), { for: 'dev' })
  const makers = String(Object(built.description.server).makers)
  assert.match(makers, /^server\/engine\.[0-9a-f]{12}\.js$/)
  assert.ok(existsSync(join(String(built.bundleFolder), makers)))
  // `engine.ts` is no definition file: nothing of it is described.
  assert.equal(Object.keys(built.description.functions).includes('scanned'), false)
})

/** The project of the reading in an engine of its own, on live data, with the makers of the test. */
async function withMakers(t: TestContext, makers: Makers): Promise<Siege> {
  const project = copyOf(t, 'reading')
  const made = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  const siege = await besieged(t, {
    bundle: made.bundleFolder,
    engine: { makers },
    open: { mode: 'test', address: '*' },
  })
  return siege
}

test('[22-20] each adapter can be replaced by a test double, and the engine uses the double: a FileStore, a TextReader, a Searcher and a ChangeSink, and a maker of the program wins over that of engine.ts', async (t) => {
  // A file store that keeps the bytes in memory, under their fingerprint.
  const kept = new Map<string, Uint8Array>()
  const files: FileStore = {
    async put(fingerprint, bytes) {
      const parts: Uint8Array[] = []
      for await (const part of bytes) parts.push(part)
      kept.set(fingerprint, new Uint8Array(Buffer.concat(parts)))
    },
    get(fingerprint, range) {
      const bytes = kept.get(fingerprint)
      if (!bytes) throw new Error('gone')
      const part = bytes.subarray(range?.from ?? 0, range?.to === undefined ? undefined : range.to + 1)
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(part)
          controller.close()
        },
      })
    },
    async remove(fingerprint) {
      kept.delete(fingerprint)
    },
  }
  // A reader of the program for a kind that the reader of `engine.ts` lists too: the one of the bundle is asked first.
  const reader: TextReader = {
    kinds: ['application/x-scan', 'application/x-note'],
    read: async (bytes) => `read by the program: ${bytes.length} bytes`,
  }
  // A search that finds a text by its last letters, as no index of words would.
  const texts = new Map<string, string>()
  const searcher: Searcher = {
    has: () => true,
    wrote(_table, id, held) {
      if (held?.body === undefined) texts.delete(id)
      else texts.set(id, held.body)
    },
    find: (_table, words, limit) =>
      [...texts]
        .filter(([, body]) => body.endsWith(words))
        .map(([id]) => id)
        .slice(0, limit),
  }
  // A sink that is handed every committed write, in order.
  const changes: { n: number; tables: string[] }[] = []
  const sink: ChangeSink = {
    start: (n) => n,
    wrote(change) {
      changes.push({ n: change.n, tables: (change.rows ?? []).map((one) => one.table) })
    },
  }
  const made = { secrets: [] as string[] }
  const siege = await withMakers(t, {
    files: () => files,
    textReaders: ({ secrets }) => {
      made.secrets.push(String(secrets.SCAN_KEY))
      return [reader]
    },
    search: () => searcher,
    changes: () => sink,
  })
  // The system calls: a loose file that code made for nobody, with no browser, is nobody's to read again.
  const call = (name: string, input: object): Promise<unknown> => siege.app.call(name, input, asSystem)

  // The bytes of a file lie in the store of the test, and in no folder of the data.
  const id = String(await call('keep', { base64: base64('kept in memory'), name: 'a.txt', kind: 'text/plain' }))
  assert.deepEqual(
    [...kept.values()].map((bytes) => Buffer.from(bytes).toString('utf8')),
    ['kept in memory'],
  )
  assert.equal(await call('bytesOf', { id }), 'kept in memory')
  const inFolder = join(siege.dataFolder, 'files')
  const lying = existsSync(inFolder) ? readdirSync(inFolder).filter((name) => name !== '.incoming') : []
  assert.deepEqual(lying, [])

  // The reader of the program is used for the kind that it alone lists.
  const note = String(await call('keep', { base64: base64('xyz'), name: 'a.note', kind: 'application/x-note' }))
  assert.equal(await call('words', { id: note }), 'read by the program: 3 bytes')
  // A secret is handed to a maker wrapped: written out, it reads as nothing of its value.
  assert.deepEqual(made.secrets, ['[secret]'])

  // The search of the test answers a search of the app.
  await call('addNote', { body: 'apple pie' })
  await call('addNote', { body: 'a pie chart' })
  assert.deepEqual(await call('findNotes', { words: 'pie' }), ['apple pie'])
  assert.deepEqual(await call('findNotes', { words: 'apple' }), [])

  // The sink was handed each write of the app, in order.
  for (let tries = 0; tries < 100 && changes.filter((one) => one.tables.includes('notes')).length < 2; tries++)
    await new Promise((done) => setTimeout(done, 20))
  const ofNotes = changes.filter((one) => one.tables.includes('notes'))
  assert.equal(ofNotes.length, 2)
  assert.ok(ofNotes[0].n < ofNotes[1].n)
})
