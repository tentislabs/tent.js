// Loaded before every test file: a test reaches nothing but this computer, and finds each part that is fetched at
// its first use standing in a runner's folder of its own, so that no test fetches one.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import dns from 'node:dns'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import { dirname, join } from 'node:path'

/** Whether a host is this computer: a name of it, an address of it, or a pipe. */
const isHere = (host: string): boolean =>
  host === '' ||
  host === 'localhost' ||
  host.endsWith('.localhost') ||
  /^(\[)?(::1|::ffff:127\.\d+\.\d+\.\d+|0\.0\.0\.0|::)(\])?$/.test(host) ||
  /^127\.\d+\.\d+\.\d+$/.test(host)

const refusal = (what: string): Error =>
  Object.assign(new Error(`A test reaches nothing but this computer: ${what} was refused.`), { code: 'ECONNREFUSED' })

/** The host that a call of `connect` of a socket names: the arguments come as options, as a port and a host, or as a pipe. */
function hostOf(args: unknown[]): string {
  const [first, second] = args
  // `net.connect` hands the socket the arguments it read, as one list.
  if (Array.isArray(first)) return hostOf(first)
  if (typeof first === 'object' && first !== null) {
    if (typeof Reflect.get(first, 'path') === 'string') return ''
    const host: unknown = Reflect.get(first, 'host')
    return typeof host === 'string' ? host : ''
  }
  if (typeof first === 'string' && !/^\d+$/.test(first)) return ''
  return typeof second === 'string' ? second : ''
}

const ownConnect: unknown = Reflect.get(net.Socket.prototype, 'connect')
if (typeof ownConnect !== 'function') throw new Error('The runtime gives no connect of a socket.')
Reflect.set(net.Socket.prototype, 'connect', function connect(this: net.Socket, ...args: unknown[]): unknown {
  const host = hostOf(args)
  if (isHere(host)) return Reflect.apply(ownConnect, this, args)
  process.nextTick(() => this.destroy(refusal(`a connection to ${host}`)))
  return this
})

const ownLookup: unknown = dns.lookup
const ownLookups: unknown = dns.promises.lookup
if (typeof ownLookup !== 'function' || typeof ownLookups !== 'function')
  throw new Error('The runtime gives no look-up of a name.')
Reflect.set(dns, 'lookup', function lookup(name: unknown, ...rest: unknown[]): void {
  if (typeof name === 'string' && isHere(name)) return void Reflect.apply(ownLookup, dns, [name, ...rest])
  const told = rest.at(-1)
  if (typeof told === 'function') process.nextTick(() => told(refusal(`a look-up of ${String(name)}`)))
})
Reflect.set(
  dns.promises,
  'lookup',
  (name: unknown, ...rest: unknown[]): Promise<unknown> =>
    typeof name === 'string' && isHere(name)
      ? Reflect.apply(ownLookups, dns.promises, [name, ...rest])
      : Promise.reject(refusal(`a look-up of ${String(name)}`)),
)
syncBuiltinESMExports()

// The parts that stand in for those that are fetched, by their names: each answers what a test of the engine
// asks of it, and nothing of the part itself.
const standIns: Record<string, Record<string, string>> = {
  // A resizer that answers each picture as it is.
  sharp: {
    'node_modules/sharp/package.json': '{ "name": "sharp", "version": "0.0.0", "main": "lib/index.js" }',
    'node_modules/sharp/lib/index.js': `module.exports = function sharp(input) {
  const chain = { toBuffer: async () => Buffer.from(input) }
  for (const name of ['rotate', 'blur', 'resize', 'avif', 'webp', 'png', 'jpeg', 'gif']) chain[name] = () => chain
  return chain
}
`,
  },
  // A reader of PDF files whose pages are what stands before each \`%%EOP\`.
  unpdf: {
    'node_modules/unpdf/package.json':
      '{ "name": "unpdf", "version": "0.0.0", "type": "module", "exports": { ".": { "default": "./dist/index.mjs" } } }',
    'node_modules/unpdf/dist/index.mjs': `export async function extractText(data) {
  const pages = Buffer.from(data).toString('latin1').split('%%EOP').slice(0, -1).map((one) => one.trim())
  return { totalPages: pages.length, text: pages }
}
`,
  },
  // A reader of spreadsheets whose workbook is JSON: each sheet by its name, a list of rows, `{ date }` a moment.
  xlsx: {
    'node_modules/xlsx/package.json':
      '{ "name": "xlsx", "version": "0.0.0", "exports": { ".": { "import": "./xlsx.mjs" } } }',
    'node_modules/xlsx/xlsx.mjs': `export function read(data, o) {
  if (!o || o.type !== 'array' || o.cellDates !== true) throw new Error('read as an array, with dates')
  const Sheets = {}
  for (const [name, rows] of Object.entries(JSON.parse(Buffer.from(data).toString('utf8'))))
    Sheets[name] = { '!ref': 'A1:Z' + rows.length, rows: rows.map((row) => row.map((one) => (one && one.date ? new Date(one.date) : one))) }
  return { SheetNames: Object.keys(Sheets), Sheets }
}
export const utils = {
  decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }),
  sheet_to_json(sheet, o) {
    if (!o || o.header !== 1 || o.raw !== true || o.blankrows !== true) throw new Error('rows as lists, raw, with blank rows')
    return sheet.rows
  },
}
`,
  },
  // The installer of packages and a Python are programs that only a test which runs Python needs: each stands as a
  // folder that says so, and such a test lays the real part in a home of its own, from `pinnedArchive` below.
  uv: { 'stand-in.txt': 'The installer of packages stands in here. A test that runs it lays the real one.\n' },
  python: { 'stand-in.txt': 'A Python stands in here. A test that runs Python lays the real one.\n' },
  // A browser of the tests is the build that the tool of tests installed, at the pinned version: none is fetched.
  browser: {
    'stand-in.txt': 'The hidden browser stands in here. A test drives the one the tool of tests installed.\n',
  },
  firefox: { 'stand-in.txt': 'A Firefox stands in here. A test drives the one the tool of tests installed.\n' },
}

/** The stand-in of a part by its name: every Python that the engine pins has the one of `python`. */
const standInOf = (name: string): Record<string, string> =>
  standIns[name] ?? (name.startsWith('python-') ? (standIns.python ?? {}) : {})

// A runner's folder of this test file alone, with each part that the engine pins standing in it.
const homes = join(process.cwd(), 'results', 'homes')
mkdirSync(homes, { recursive: true })
const home = mkdtempSync(join(homes, 'home-'))
const pinned: unknown = JSON.parse(readFileSync(new URL('../parts/engine/fetched.json', import.meta.url), 'utf8'))
for (const line of Array.isArray(pinned) ? pinned : []) {
  const [name, version] = [String(Reflect.get(Object(line), 'name')), String(Reflect.get(Object(line), 'version'))]
  for (const [path, text] of Object.entries(standInOf(name))) {
    const at = join(home, 'fetched', `${name}@${version}`, path)
    mkdirSync(dirname(at), { recursive: true })
    writeFileSync(at, text)
  }
}
process.env.TENT_HOME = home
process.on('exit', () => rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }))

/** Whether bytes have a fingerprint as the list writes it: SHA-256 in hex, or SHA-512 in base64 after `sha512-`. */
const hasFingerprint = (bytes: Uint8Array, written: string): boolean =>
  written.startsWith('sha512-')
    ? createHash('sha512').update(bytes).digest('base64') === written.slice('sha512-'.length)
    : createHash('sha256').update(bytes).digest('hex') === written.toLowerCase()

// The program that fetches one file of a part: it is started apart, since this rig holds every test to this computer.
const fetchOne = `import { createHash } from 'node:crypto'
import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs'
const [from, fingerprint, file] = process.argv.slice(1)
const answer = await fetch(from)
if (!answer.ok) throw new Error(from + ' answered ' + answer.status)
const bytes = new Uint8Array(await answer.arrayBuffer())
const hex = createHash('sha256').update(bytes).digest('hex')
const long = 'sha512-' + createHash('sha512').update(bytes).digest('base64')
if (fingerprint !== hex && fingerprint !== long) throw new Error(from + ' answered bytes of another fingerprint')
writeFileSync(file + '.' + process.pid, bytes)
// Test files fetch side by side: where another one laid the file first, Windows refuses to replace it while it is
// read, and the file that stands is the same bytes, which the caller holds to the fingerprint.
try {
  renameSync(file + '.' + process.pid, file)
} catch (error) {
  rmSync(file + '.' + process.pid, { force: true })
  if (!existsSync(file)) throw error
}
`

/**
 * Takes the name of a part that the engine pins, and the system whose file is asked for: this one where none is
 * named, written as the runtime names it. Answers the line of the list for it and the path of its file, which is
 * fetched once into `results/pinned/` under its fingerprint, by a program of its own that this rig does not hold to
 * this computer, and held to that fingerprint at each asking. So a test serves the real part from this computer,
 * as the place it comes from. Throws where the list holds no such line, or the file cannot be fetched.
 */
export function pinnedArchive(
  name: string,
  system = `${process.platform}-${process.arch}`,
): { line: Record<string, string>; file: string } {
  const line = (Array.isArray(pinned) ? pinned : []).find(
    (one) =>
      Reflect.get(Object(one), 'name') === name && [undefined, system].includes(Reflect.get(Object(one), 'system')),
  )
  const read: Record<string, string> = Object.fromEntries(
    Object.entries(Object(line)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
  const { from, fingerprint } = read
  if (from === undefined || fingerprint === undefined) throw new Error(`fetched.json pins no ${name} for ${system}`)
  const folder = join(process.cwd(), 'results', 'pinned')
  mkdirSync(folder, { recursive: true })
  const file = join(folder, fingerprint.replace(/[^\w.-]/g, '_'))
  if (!existsSync(file)) {
    const done = spawnSync(process.execPath, ['--input-type=module', '-e', fetchOne, from, fingerprint, file], {
      encoding: 'utf8',
      timeout: 600_000,
    })
    if (done.status !== 0) throw new Error(`${name} for ${system} could not be fetched once: ${done.stderr}`)
  }
  if (!hasFingerprint(readFileSync(file), fingerprint)) throw new Error(`${file} does not have its fingerprint`)
  return { line: read, file }
}
