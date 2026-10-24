import { createHash, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { brotliCompressSync, constants } from 'node:zlib'
import type { GuardedFetch } from '../../connect/index.ts'
import { guardedFetch } from '../../connect/index.ts'

// Small releases that a test makes itself, served from this computer: each layer a tar packed with Brotli, every
// list signed with a key of the test's own, as the release script of the repository makes them.

const system = `${process.platform}-${process.arch}`

/** A key that signs releases, made for one test alone. */
export interface TestKey {
  public: string
  private: string
}

/** Makes a release key for a test. */
export function releaseKey(): TestKey {
  const { privateKey } = generateKeyPairSync('ed25519')
  const jwk = privateKey.export({ format: 'jwk' })
  return {
    public: Buffer.from(String(jwk.x), 'base64url').toString('base64'),
    private: Buffer.from(String(jwk.d), 'base64url').toString('base64'),
  }
}

/** The line of a signature that a key makes over bytes, as `<name>.sig` holds it. */
function signatureLine(bytes: Uint8Array, key: TestKey): string {
  const print = createHash('sha256').update(Buffer.from(key.public, 'base64')).digest('hex').slice(0, 16)
  const own = createPrivateKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      d: Buffer.from(key.private, 'base64').toString('base64url'),
      x: Buffer.from(key.public, 'base64').toString('base64url'),
    },
    format: 'jwk',
  })
  return `${print} ${sign(null, bytes, own).toString('base64')}\n`
}

/** Writes a list as JSON, and with keys its signatures beside it. */
export function signedFile(file: string, value: object, keys: TestKey[]): void {
  mkdirSync(dirname(file), { recursive: true })
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
  writeFileSync(file, bytes)
  if (keys.length) writeFileSync(`${file}.sig`, keys.map((one) => signatureLine(bytes, one)).join(''))
}

/** One header of a tar entry, in the form every reader of tar takes. */
function header(name: string, size: number, kind: '0' | '5', mode: number): Buffer {
  const block = Buffer.alloc(512)
  const field = (at: number, length: number, value: string | number) => {
    const text = typeof value === 'number' ? `${value.toString(8).padStart(length - 1, '0')}\0` : value
    block.write(text, at, Math.min(Buffer.byteLength(text), length))
  }
  field(0, 100, name)
  field(100, 8, mode)
  field(108, 8, 0)
  field(116, 8, 0)
  field(124, 12, size)
  field(136, 12, 0)
  block.fill(' ', 148, 156)
  block.write(kind, 156)
  block.write('ustar\0', 257)
  block.write('00', 263)
  let sum = 0
  for (const byte of block) sum += byte
  field(148, 8, sum)
  return block
}

/** A layer: its files by path, packed as a tar with Brotli. */
export function layerOf(files: Record<string, Uint8Array | string>): Buffer {
  const pieces: Buffer[] = []
  const folders = new Set<string>()
  for (const [path, value] of Object.entries(files)) {
    const parts = path.split('/')
    for (let k = 1; k < parts.length; k++) {
      const folder = `${parts.slice(0, k).join('/')}/`
      if (folders.has(folder)) continue
      folders.add(folder)
      pieces.push(header(folder, 0, '5', 0o755))
    }
    const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value)
    pieces.push(header(path, bytes.length, '0', /\/(node|bin\/node)$/.test(path) ? 0o755 : 0o644), bytes)
    pieces.push(Buffer.alloc((512 - (bytes.length % 512)) % 512))
  }
  pieces.push(Buffer.alloc(1024))
  return brotliCompressSync(Buffer.concat(pieces), { params: { [constants.BROTLI_PARAM_QUALITY]: 1 } })
}

/** The program file of the runtime of this system, by its path in a version. */
export const runtimePath = process.platform === 'win32' ? 'runtime/node.exe' : 'runtime/bin/node'

/** The player of a test version: a program that says which version it is. */
export const playerOf = (version: string): Record<string, string> => ({
  'player/tent.mjs': `console.log(JSON.stringify({ version: ${JSON.stringify(version)} }))\n`,
})

/**
 * Writes a release of a version into the folder that releases are served from: its layers for this system, its
 * `release.json` and its `trust.json`, signed with the keys handed in. `runtime` is the bytes of its runtime file;
 * a test that runs the version hands the real one.
 */
export function madeRelease(
  served: string,
  version: string,
  o: {
    keys: TestKey[]
    runtime?: Uint8Array
    made?: number
    tools?: boolean
    trust?: { keys: string[]; made: number }
  },
): void {
  const at = join(served, version)
  mkdirSync(at, { recursive: true })
  const layers: Record<string, Buffer> = {
    runtime: layerOf({ [runtimePath]: o.runtime ?? `runtime ${version}` }),
    player: layerOf(playerOf(version)),
    ...(o.tools === false
      ? {}
      : { tools: layerOf({ 'tools/parts/build/index.js': `export const v = '${version}'\n` }) }),
  }
  const lines: Record<string, object> = {}
  for (const [name, bytes] of Object.entries(layers)) {
    const file = `${name}-${system}.tar.br`
    writeFileSync(join(at, file), bytes)
    lines[name] = { file, size: bytes.length, fingerprint: createHash('sha256').update(bytes).digest('hex') }
  }
  const made = o.made ?? Date.now()
  signedFile(
    join(at, 'release.json'),
    {
      format: 'tent.release/1',
      version,
      day: '2026-11-02',
      fix: false,
      made,
      layers: { [system]: lines },
      archives: {},
    },
    o.keys,
  )
  signedFile(
    join(at, 'trust.json'),
    { format: 'tent.trust/1', made: o.trust?.made ?? 1, keys: o.trust?.keys ?? o.keys.map((one) => one.public) },
    o.keys,
  )
}

/** Writes `releases.json` of the served folder: the versions, newest first, made at a moment. */
export function madeReleases(served: string, versions: string[], keys: TestKey[], made = Date.now()): void {
  signedFile(
    join(served, 'releases.json'),
    {
      format: 'tent.releases/1',
      made,
      versions: versions.map((version) => ({ version, day: '2026-11-02', fix: false })),
    },
    keys,
  )
}

/**
 * Lays a version of an install as an installer leaves it, from a release that was made: its layers unpacked by a
 * test of its own reading, `current`, and `trust.json`.
 */
export function installedFrom(home: string, version: string, keys: TestKey[], runtime?: string): void {
  const at = join(home, 'versions', version)
  mkdirSync(join(at, dirname(runtimePath)), { recursive: true })
  if (runtime) copyFileSync(runtime, join(at, runtimePath))
  else writeFileSync(join(at, runtimePath), `runtime ${version}`)
  for (const [path, text] of Object.entries(playerOf(version))) {
    mkdirSync(dirname(join(at, path)), { recursive: true })
    writeFileSync(join(at, path), text)
  }
  writeFileSync(join(home, 'current'), `${version}\n`)
  writeFileSync(
    join(home, 'trust.json'),
    JSON.stringify({ format: 'tent.trust/1', made: 1, keys: keys.map((one) => one.public) }),
  )
}

/** A stand-in of where releases are served: a server of this computer on a free port, ended with the test. */
export async function releasesServer(
  t: TestContext,
  folder: string,
  o: { slow?: (path: string) => boolean } = {},
): Promise<{ address: string; fetch: GuardedFetch; asked: string[]; close(): Promise<void> }> {
  const asked: string[] = []
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://here').pathname).replace(/^\/+/, '')
    asked.push(path)
    let bytes: Buffer
    try {
      bytes = readFileSync(join(folder, path))
    } catch {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200)
    if (!o.slow?.(path)) {
      response.end(bytes)
      return
    }
    let at = 0
    const timer = setInterval(() => {
      if (at >= bytes.length || response.destroyed) {
        clearInterval(timer)
        response.end()
        return
      }
      response.write(bytes.subarray(at, at + 1))
      at++
    }, 1000)
    response.on('close', () => clearInterval(timer))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  let closed = false
  const close = (): Promise<void> => {
    if (closed) return Promise.resolve()
    closed = true
    server.closeAllConnections()
    return new Promise((done) => server.close(() => done()))
  }
  t.after(close)
  const address = `http://127.0.0.1:${port}/`
  return { address, fetch: guardedFetch({ mode: 'live', privateHosts: [`http://127.0.0.1:${port}`] }), asked, close }
}

/** An empty folder for one test under the folder that git leaves out, removed when the test ends. */
export function releaseFolderOf(t: TestContext, name: string): string {
  const folder = join(process.cwd(), 'results', 'releasing', `${name}-${process.pid}-${Date.now()}`)
  mkdirSync(folder, { recursive: true })
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }))
  return folder
}
