import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { basename } from 'node:path'
import type { TestContext } from 'node:test'
import { crc32, deflateRawSync, gzipSync } from 'node:zlib'
import { pinnedArchive } from '../../../rig/offline.ts'

const encoder = new TextEncoder()

/** One file of a package index that a test writes: its name in the index, and its bytes. */
export interface PackageFile {
  name: string
  file: string
  bytes: Uint8Array
}

/** Answers the bytes of a zip archive that holds each text at its path, each packed, as a ready-built package is. */
function zipOf(files: Record<string, string>): Uint8Array {
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let at = 0
  for (const [path, text] of Object.entries(files)) {
    const name = encoder.encode(path)
    const plain = encoder.encode(text)
    const packed = deflateRawSync(plain)
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
    listed.writeUInt16LE(20, 4)
    shared.copy(listed, 6)
    listed.writeUInt32LE(at, 42)
    central.push(listed, name)
    at += 30 + name.length + packed.length
  }
  const size = central.reduce((all, one) => all + one.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(central.length / 2, 8)
  end.writeUInt16LE(central.length / 2, 10)
  end.writeUInt32LE(size, 12)
  end.writeUInt32LE(at, 16)
  return Buffer.concat([...local, ...central, end])
}

/** The line of the list of a wheel's files: its path, its fingerprint in the form of the standard, and its size. */
const recordLine = (path: string, text: string): string =>
  `${path},sha256=${createHash('sha256').update(text).digest('base64url')},${encoder.encode(text).length}`

/**
 * Takes a name, a version, the tag of the systems it is built for, the texts of its files by their paths, and what
 * it needs. Answers a ready-built package of the standard form, which the installer takes as any other.
 */
export function wheelOf(
  name: string,
  version: string,
  tag: string,
  files: Record<string, string>,
  needs: string[] = [],
): PackageFile {
  const info = `${name}-${version}.dist-info`
  const all: Record<string, string> = {
    ...files,
    [`${info}/METADATA`]: `Metadata-Version: 2.1\nName: ${name}\nVersion: ${version}\n${needs.map((one) => `Requires-Dist: ${one}\n`).join('')}`,
    [`${info}/WHEEL`]: `Wheel-Version: 1.0\nGenerator: tests\nRoot-Is-Purelib: true\nTag: ${tag}\n`,
  }
  const record = [...Object.entries(all).map(([path, text]) => recordLine(path, text)), `${info}/RECORD,,`].join('\n')
  return { name, file: `${name}-${version}-${tag}.whl`, bytes: zipOf({ ...all, [`${info}/RECORD`]: `${record}\n` }) }
}

/** Answers a package that is a source file alone, whose setup would write a file named `setup-was-run` where it ran. */
function sourceOf(name: string, version: string): PackageFile {
  const entries: [string, string][] = [
    ['setup.py', "open('setup-was-run', 'w').write('run')\nfrom setuptools import setup\nsetup()\n"],
    ['PKG-INFO', `Metadata-Version: 2.1\nName: ${name}\nVersion: ${version}\n`],
  ]
  const blocks: Uint8Array[] = []
  for (const [path, text] of entries) {
    const head = new Uint8Array(512)
    const put = (at: number, value: string) => head.set(encoder.encode(value), at)
    const bytes = encoder.encode(text)
    put(0, `${name}-${version}/${path}`)
    put(100, '0000644\0')
    put(108, '0000000\0')
    put(116, '0000000\0')
    put(124, `${bytes.length.toString(8).padStart(11, '0')}\0`)
    put(136, '00000000000\0')
    put(148, '        ')
    put(156, '0')
    put(257, 'ustar\x0000')
    const sum = head.reduce((total, byte) => total + byte, 0)
    put(148, `${sum.toString(8).padStart(6, '0')}\0 `)
    blocks.push(head, bytes, new Uint8Array((512 - (bytes.length % 512)) % 512))
  }
  blocks.push(new Uint8Array(1024))
  return { name, file: `${name}-${version}.tar.gz`, bytes: gzipSync(Buffer.concat(blocks)) }
}

/** The packages that most tests lay in the index: one for every system, one with a file for each of six, and one that only builds. */
export const testPackages = (): PackageFile[] => [
  wheelOf('tinyone', '1.0', 'py3-none-any', { 'tinyone/__init__.py': 'VALUE = 1\n' }),
  wheelOf('tinyone', '2.0', 'py3-none-any', { 'tinyone/__init__.py': 'VALUE = 2\n' }),
  ...[
    'win_amd64',
    'win_arm64',
    'manylinux_2_17_x86_64.manylinux2014_x86_64',
    'manylinux_2_17_aarch64.manylinux2014_aarch64',
    'macosx_11_0_arm64',
    'macosx_10_12_x86_64',
  ].map((tag) =>
    wheelOf('natone', '1.0', `py3-none-${tag}`, { 'natone/__init__.py': `TAG = '${tag}'\n` }, ['tinyone>=1']),
  ),
  wheelOf('winonly', '1.0', 'py3-none-win_amd64', { 'winonly/__init__.py': 'X = 1\n' }),
  sourceOf('sdistonly', '1.0'),
]

/** What a test sees of the stand-in: who was asked what, and how it is changed or switched off. */
export interface StandIn {
  // The address that serves the parts, and under it at `/simple/` the usual package index.
  parts: string
  origin: string
  // Each request, as its path with the header of its sign-in where one came.
  asked: { path: string; auth?: string }[]
  // Serves other bytes for a file of a package, or of a part, from now on.
  replace(file: string, bytes: Uint8Array): void
  off(): Promise<void>
}

/** The name of a package as the index writes it: small letters, with every run of `-`, `_` and `.` one `-`. */
const normal = (name: string): string => name.toLowerCase().replace(/[-_.]+/g, '-')

/**
 * Starts a stand-in on this computer, on a free port, for the place the parts come from and for the package index:
 * under `/parts/` the real archive of the installer and of each pinned Python for this system, which the rig fetched
 * once, and under `/parts/simple/` an index of the packages the test hands, in the simple form of the standard. The
 * same index under `/private/` asks for the name `reader` and the password `s3cret`. It is closed when the test ends.
 */
export async function pythonStandIn(
  t: Pick<TestContext, 'after'> | { after(fn: () => Promise<void>): void },
  packages: PackageFile[] = testPackages(),
): Promise<StandIn> {
  const files = new Map<string, Uint8Array>()
  for (const name of ['uv', 'python-3.14', 'python-3.15']) {
    const { line, file } = pinnedArchive(name)
    files.set(decodeURIComponent(basename(new URL(line.from ?? '').pathname)), readFileSync(file))
  }
  const served = new Map(packages.map((one) => [one.file, one.bytes]))
  const asked: StandIn['asked'] = []
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://here')
    const auth = request.headers.authorization
    asked.push({ path: url.pathname, ...(auth ? { auth } : {}) })
    const path = decodeURIComponent(url.pathname)
    const inside = path.match(/^\/(parts|private)\/(.*)$/)
    if (!inside) return void response.writeHead(404).end()
    const [, top, rest = ''] = inside
    if (top === 'private' && auth !== `Basic ${Buffer.from('reader:s3cret').toString('base64')}`)
      return void response.writeHead(401, { 'www-authenticate': 'Basic realm="index"' }).end()
    const part = files.get(rest)
    if (top === 'parts' && part) return void response.writeHead(200).end(part)
    const page = rest.match(/^simple\/([^/]+)\/?$/)
    if (page) {
      const of = packages.filter((one) => normal(one.name) === normal(page[1] ?? ''))
      if (!of.length) return void response.writeHead(404).end()
      const links = of.map((one) => {
        const bytes = served.get(one.file) ?? one.bytes
        const print = createHash('sha256')
          .update(packages.find((p) => p.file === one.file)?.bytes ?? bytes)
          .digest('hex')
        return `<a href="/${top}/files/${one.file}#sha256=${print}">${one.file}</a><br>`
      })
      return void response
        .writeHead(200, { 'content-type': 'text/html' })
        .end(`<!DOCTYPE html><html><body>${links.join('')}</body></html>`)
    }
    const file = rest.match(/^files\/([^/]+)$/)
    const bytes = file ? served.get(file[1] ?? '') : undefined
    if (bytes) return void response.writeHead(200).end(bytes)
    response.writeHead(404).end()
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
  const origin = `http://127.0.0.1:${at.port}`
  return {
    parts: `${origin}/parts`,
    origin,
    asked,
    replace: (file, bytes) => {
      if (served.has(file)) served.set(file, bytes)
      else files.set(file, bytes)
    },
    off,
  }
}
