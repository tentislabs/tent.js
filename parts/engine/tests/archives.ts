import assert from 'node:assert/strict'
import { cpSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { crc32, deflateRawSync, gzipSync } from 'node:zlib'
import type { Loaded } from '../../core/internal.ts'
import { describe, describing, finish, fingerprintOf, write } from '../../core/internal.ts'
import type { App, FetchedPart } from '../index.ts'
import { engineOf, portOf, workFolder } from './apps.ts'

/** One entry of an archive that a test packs: a file with its text, a folder, a link, or a hard link. */
export interface Packed {
  path: string
  text?: string
  folder?: true
  // Where a link points, as it is written into the archive.
  link?: string
  // The entry of the archive that a hard link is one more name of.
  hard?: string
  mode?: number
}

const encoder = new TextEncoder()

/** Writes a text into a field of a header, and fails where the field is too short for it. */
function field(block: Uint8Array, at: number, length: number, text: string): void {
  const bytes = encoder.encode(text)
  assert.ok(bytes.length <= length, `${text} does not fit a field of ${length} bytes`)
  block.set(bytes, at)
}

/** Answers one entry of a tar archive: its header, with the sum of its bytes, and its content filled up to whole blocks. */
function tarEntry(o: { path: string; kind: string; mode: number; to: string; bytes: Uint8Array }): Uint8Array[] {
  const head = new Uint8Array(512)
  field(head, 0, 100, o.path)
  field(head, 100, 8, `${o.mode.toString(8).padStart(7, '0')}\0`)
  field(head, 108, 8, '0000000\0')
  field(head, 116, 8, '0000000\0')
  field(head, 124, 12, `${o.bytes.length.toString(8).padStart(11, '0')}\0`)
  field(head, 136, 12, '00000000000\0')
  field(head, 148, 8, '        ')
  field(head, 156, 1, o.kind)
  field(head, 157, 100, o.to)
  field(head, 257, 8, 'ustar\x0000')
  const sum = head.reduce((all, byte) => all + byte, 0)
  field(head, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `)
  return [head, o.bytes, new Uint8Array((512 - (o.bytes.length % 512)) % 512)]
}

/**
 * Answers the bytes of a tar archive, in the form that every tool reads, of the entries in their order. A path and
 * a link that pass the hundred bytes of their field stand in an entry of their own before it, as GNU tar writes them.
 */
export function tarOf(entries: Packed[]): Uint8Array<ArrayBuffer> {
  const blocks: Uint8Array[] = []
  for (const entry of entries) {
    const to = entry.link ?? entry.hard ?? ''
    const long = (kind: string, text: string): string => {
      if (encoder.encode(text).length <= 100) return text
      blocks.push(...tarEntry({ path: '././@LongLink', kind, mode: 0, to: '', bytes: encoder.encode(`${text}\0`) }))
      return 'cut'
    }
    blocks.push(
      ...tarEntry({
        to: long('K', to),
        path: long('L', entry.path),
        kind: entry.folder ? '5' : entry.link !== undefined ? '2' : entry.hard !== undefined ? '1' : '0',
        mode: entry.mode ?? (entry.folder ? 0o755 : 0o644),
        bytes: encoder.encode(entry.text ?? ''),
      }),
    )
  }
  blocks.push(new Uint8Array(1024))
  return Buffer.concat(blocks)
}

/** Answers a tar archive packed with gzip, as a package file of the npm registry is. */
export const tgzOf = (entries: Packed[]): Uint8Array<ArrayBuffer> => gzipSync(tarOf(entries))

/** Answers the bytes of a zip archive of the entries in their order, each packed, with a link written as a tool of macOS and Linux writes one. */
export function zipOf(entries: Packed[]): Uint8Array<ArrayBuffer> {
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let at = 0
  for (const entry of entries) {
    assert.equal(entry.hard, undefined, 'a zip archive holds no hard link')
    const name = encoder.encode(entry.folder ? `${entry.path}/` : entry.path)
    const plain = encoder.encode(entry.link ?? entry.text ?? '')
    const packed = deflateRawSync(plain)
    const kind = entry.folder ? 0o040000 : entry.link !== undefined ? 0o120000 : 0o100000
    const mode = entry.mode ?? (entry.folder ? 0o755 : 0o644)
    const shared = Buffer.alloc(26)
    shared.writeUInt16LE(20, 0)
    shared.writeUInt16LE(0x0800, 2)
    shared.writeUInt16LE(8, 4)
    shared.writeUInt32LE(crc32(plain), 10)
    shared.writeUInt32LE(packed.length, 14)
    shared.writeUInt32LE(plain.length, 18)
    shared.writeUInt16LE(name.length, 22)
    const first = Buffer.alloc(4)
    first.writeUInt32LE(0x04034b50, 0)
    local.push(first, shared, name, packed)
    const listed = Buffer.alloc(46)
    listed.writeUInt32LE(0x02014b50, 0)
    // Made on a system of the Unix kind, which is what says that the mode of an entry is to be read.
    listed.writeUInt16LE((3 << 8) | 20, 4)
    shared.copy(listed, 6)
    listed.writeUInt32LE(((kind | mode) << 16) >>> 0, 38)
    listed.writeUInt32LE(at, 42)
    central.push(listed, name)
    at += 30 + name.length + packed.length
  }
  const size = central.reduce((all, one) => all + one.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(size, 12)
  end.writeUInt32LE(at, 16)
  return Buffer.concat([...local, ...central, end])
}

/** A stand-in for the place that parts are fetched from: its address, each path it was asked, and how it is switched off. */
export interface PartServer {
  origin: string
  port: number
  asked: string[]
  off(): Promise<void>
}

/**
 * Starts a server on this computer, on a free port that the system gives, which answers each path with the bytes
 * that the test laid there, after `wait` milliseconds. It is closed when the test ends, also where the test fails.
 */
export async function partServer(t: TestContext, files: Record<string, Uint8Array>, wait = 0): Promise<PartServer> {
  const asked: string[] = []
  const server = createServer((request, response) => {
    const path = request.url ?? ''
    asked.push(path)
    const bytes = files[path]
    const timer = setTimeout(() => {
      if (bytes) response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(bytes)
      else response.writeHead(404).end('no such file')
    }, wait)
    // An answer that comes after its test has ended keeps no program running: the server is closed by then.
    timer.unref()
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  let closed = false
  const off = async (): Promise<void> => {
    if (closed) return
    closed = true
    server.closeAllConnections()
    await new Promise((done) => server.close(done))
  }
  t.after(off)
  const at = server.address()
  assert.ok(at !== null && typeof at === 'object')
  return { origin: `http://127.0.0.1:${at.port}`, port: at.port, asked, off }
}

/** Answers the line of a list of parts for one file of a stand-in server: its fingerprint is that of the bytes. */
export const lineOf = (name: string, version: string, from: string, bytes: Uint8Array): FetchedPart => ({
  name,
  version,
  from,
  fingerprint: fingerprintOf(bytes),
})

/** Answers the path of every file and folder under a folder, from that folder, written with `/`, in the order of their names. */
export function everythingIn(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .map((one) => one.replaceAll('\\', '/'))
    .sort()
}

/** Answers every path under a folder, written with `/`, in the order of their names. A link is named and not followed. */
export function walk(root: string): string[] {
  const found: string[] = []
  const into = (from: string): void => {
    for (const name of readdirSync(join(root, from))) {
      const path = from === '' ? name : `${from}/${name}`
      found.push(path)
      const what = lstatSync(join(root, path))
      if (what.isDirectory() && !what.isSymbolicLink()) into(path)
    }
  }
  into('')
  return found.sort()
}

// The project of an app whose one action needs a part: its file, as the builder of an app writes it.
const needsProject = fileURLToPath(new URL('./needs/', import.meta.url))

/**
 * Opens the app that needs a part, in an engine of the test, in the mode that the test names. Answers the app and
 * its address on this computer. No test of this part may use the build, so the bundle is made as `apps.ts` makes one.
 */
export async function needing(
  t: TestContext,
  mode: 'development' | 'test' | 'live',
): Promise<{ app: App; origin: string }> {
  const work = workFolder(t)
  const file = 'functions.ts'
  const given: Record<string, object> = await describing(() => import(pathToFileURL(join(needsProject, file)).href))
  const definitions: Loaded[] = Object.entries(given).map(([exportName, value]) => ({ value, file, exportName }))
  const { description, findings } = describe({ definitions })
  assert.deepEqual(
    findings.map((one) => `${one.code} ${one.message}`),
    [],
  )
  const { text, versionId } = write(finish(description, { modules: { [file]: `server/${file}` }, sources: {} }))
  const folder = join(work, 'bundles', versionId)
  mkdirSync(join(folder, 'server'), { recursive: true })
  writeFileSync(join(folder, 'description.json'), text)
  cpSync(join(needsProject, file), join(folder, 'server', file))
  const dataFolder = join(work, 'data')
  const app = await engineOf(t).open(folder, { dataFolder, mode })
  return { app, origin: `http://localhost:${portOf(dataFolder)}` }
}

/** Says, for the folder of a path of the test, where a part of a name and a version lies once it is fetched. */
export const placeOf = (folder: string, name: string, version: string): string =>
  join(folder, 'fetched', `${name}@${version}`)

/** Answers the whole path of a folder as an entry of an archive writes one, with `/` between its pieces. */
export const wholePath = (folder: string): string => folder.replaceAll('\\', '/')
