#!/usr/bin/env node
// The `tent` of the npm door: a small program, plain enough for every Node.js that npm still runs on, which starts
// the pinned runtime with the player and the words it was handed. Where the files of this system are missing or
// are of another system, it repairs them first: it fetches the layer of this system of its own version from where
// releases are served, holds it to `systems.json` of this package, and lays it into the install's own folder.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { layEntries, readLayer } from './layer.mjs'

const here = dirname(dirname(fileURLToPath(import.meta.url)))
const system = `${process.platform}-${process.arch}`
const listed = JSON.parse(readFileSync(join(here, 'systems.json'), 'utf8'))
const version = listed.version
const node = process.platform === 'win32' ? join('runtime', 'node.exe') : join('runtime', 'bin', 'node')

/** Ends with 2 and one sentence, and runs nothing. */
function stop(sentence) {
  process.stderr.write(`${sentence}\n`)
  process.exit(2)
}

/** The install's own folder: what `TENT_HOME` names, or the person's own place of the system. */
function homeOf() {
  if (process.env.TENT_HOME) return process.env.TENT_HOME
  if (process.platform !== 'win32') return join(homedir(), '.tent')
  return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Tent')
}

/**
 * Whether, on Linux, the group of an id holds no person but the current user: the private group each user has
 * there, which npm leaves its folders open to under the umask 0002 that Ubuntu gives. On macOS the person's own
 * group, staff, holds every person of the computer, so a group is never the person alone there.
 */
function groupOfOne(gid) {
  if (process.platform !== 'linux' || gid !== process.getgid()) return false
  try {
    const me = userInfo().username
    const fields = (file) => readFileSync(file, 'utf8').split('\n').map((line) => line.split(':'))
    const group = fields('/etc/group').find((one) => Number(one[2]) === gid)
    if (!group || (group[3] ?? '').split(',').some((name) => name !== '' && name !== me)) return false
    return !fields('/etc/passwd').some((one) => one[0] && one[0] !== me && Number(one[3]) === gid)
  } catch {
    return false
  }
}

/** Whether a folder is one the launcher runs from: the person's own, and not one others can write into. */
function ownFolder(folder) {
  if (process.platform === 'win32') return true
  const stat = statSync(folder)
  if (stat.uid !== process.getuid() || (stat.mode & 0o002) !== 0) return false
  return (stat.mode & 0o020) === 0 || groupOfOne(stat.gid)
}

/** The folder of the package of this system, where npm laid it beside this one and it holds its runtime. */
function systemPackage() {
  try {
    const found = dirname(createRequire(join(here, 'package.json')).resolve(`@tentislabs/tentjs-runtime-${system}/package.json`))
    return existsSync(join(found, node)) ? found : undefined
  } catch {
    return undefined
  }
}

/** Fetches the layer of this system and lays it into `versions/<version>/` of the install's own folder. */
async function repaired(home, laid) {
  const line = listed.systems?.[system]
  if (!line) stop(`Tent.js ${version} has no release for ${system}.`)
  let releases = process.env.TENT_RELEASES
  if (!releases) {
    try {
      releases = JSON.parse(readFileSync(join(here, 'player', 'shipped.json'), 'utf8')).releases
    } catch {
      releases = undefined
    }
  }
  if (!releases)
    stop(`Tent.js lacks the files of ${system}, and no address of releases ships with it: install @tentislabs/tentjs-runtime-${system}@${version}, or name an address with TENT_RELEASES.`)
  const address = new URL(`${version}/${line.file}`, releases.endsWith('/') ? releases : `${releases}/`).href
  let bytes
  try {
    const answer = await fetch(address, { signal: AbortSignal.timeout(30 * 60 * 1000) })
    if (!answer.ok) throw new Error(`it answered ${answer.status}`)
    const reader = answer.body.getReader()
    const pieces = []
    let size = 0
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      size += read.value.length
      // A layer is held to the size that systems.json states: what is larger is cut.
      if (size > line.size) {
        await reader.cancel()
        throw new Error('it sent more than systems.json states')
      }
      pieces.push(read.value)
    }
    bytes = Buffer.concat(pieces)
  } catch (error) {
    stop(`Tent.js lacks the files of ${system} and could not fetch ${line.file} from ${new URL(releases).host}, since this computer does not reach it over the network (${error.message}): connect, and type the command again.`)
  }
  if (bytes.length !== line.size || createHash('sha256').update(bytes).digest('hex') !== line.fingerprint)
    stop(`${line.file} does not have the size and the fingerprint that systems.json of Tent.js ${version} states: it was thrown away, and nothing ran.`)
  let entries
  try {
    entries = readLayer(bytes)
  } catch (error) {
    stop(`${line.file} was thrown away: ${error.message}.`)
  }
  const laying = join(home, 'versions', `.${version}.${process.pid}`)
  rmSync(laying, { recursive: true, force: true })
  layEntries(entries, laying)
  mkdirSync(laid, { recursive: true, mode: 0o700 })
  for (const folder of ['runtime', 'natives']) {
    rmSync(join(laid, folder), { recursive: true, force: true })
    if (existsSync(join(laying, folder))) renameSync(join(laying, folder), join(laid, folder))
  }
  rmSync(laying, { recursive: true, force: true })
}

const own = systemPackage()
const home = homeOf()
const laid = join(home, 'versions', version)
let from = own
if (!from && existsSync(join(laid, node)) && existsSync(join(laid, 'natives'))) from = laid
if (!from) {
  mkdirSync(home, { recursive: true, mode: 0o700 })
  await repaired(home, laid)
  from = laid
}
if (!ownFolder(from)) stop(`Tent.js runs nothing from ${from}: it is not your own, or others can write into it.`)
// The program files of the build tools lie beside the runtime, in the package of the system or where they were laid.
const natives = own ?? join(laid, 'natives')
const hook = `${pathToFileURL(join(here, 'bin', 'natives.mjs')).href}?at=${encodeURIComponent(natives)}`
// The program is told what started it, so that a definition of the system starts it the same way again.
const child = spawn(join(from, node), [`--import=${hook}`, join(here, 'player', 'tent.mjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, TENT_LAUNCHER: fileURLToPath(import.meta.url), TENT_NODE: process.execPath },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
