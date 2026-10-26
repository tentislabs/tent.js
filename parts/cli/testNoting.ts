import * as files from 'node:fs'
import * as promised from 'node:fs/promises'
import * as http from 'node:http'
import * as https from 'node:https'
import { registerHooks } from 'node:module'
import * as net from 'node:net'
import { relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fingerprintOf } from '../core/internal.ts'
import { isAppModule, noteLoaded, noteOutside, noteWordsRead, testUnderWay } from '../engine/index.ts'

// Loaded into the program of each test file of an app under `tent test`, before the file itself. What the test file
// imports as `node:test` is the face that runs each test as its own work. What it and the app's code import as
// `node:fs`, and what the app's code imports as `node:http`, `node:https` and `node:net`, notes that the test under
// way reached outside what the engine holds for it; where the program holds what reaches outside, a connection is
// refused. A plain `fetch` of the test's own code that leaves the program is noted too, each module of the project
// that the program loads is noted with its fingerprint, and each word of the environment a test reads with its value.

const face = new URL('./testFace.ts', import.meta.url).href
const engine = new URL('../engine/index.ts', import.meta.url).href
const folder = process.cwd()
const project = `${pathToFileURL(folder).href}/`
// The scheme of the modules of the runtime that note each use.
const scheme = 'tent-noted:'

/** Whether a module is the app's: a file of its project that is no package, or a module of its code the engine loaded. */
const ofApp = (parent: string | undefined): boolean => parent !== undefined && isAppModule(parent, project)

/**
 * The modules of the runtime that note, each with the functions that note, or `true` for every one whose name begins
 * in lowercase, and whether a connection by it is refused where the program holds what reaches outside.
 */
const noting: Record<string, { given: Record<string, unknown>; ways: true | string[]; held: boolean }> = {
  fs: { given: files, ways: true, held: false },
  'fs/promises': { given: promised, ways: true, held: false },
  http: { given: http, ways: ['get', 'request'], held: true },
  https: { given: https, ways: ['get', 'request'], held: true },
  net: { given: net, ways: ['connect', 'createConnection'], held: true },
}

/**
 * The text of a module that gives what a module of the runtime gives, each function that notes first noting that the
 * test under way reached outside, or refusing where the program holds what reaches outside: a constant, a class and
 * the default are given as they are, but for the promises of `node:fs`, whose functions note too.
 */
function notingText(name: string): string {
  const { given, ways, held } = noting[name]
  const notes = (key: string): boolean => (ways === true ? /^[a-z]/.test(key) : ways.includes(key))
  const lines = [
    `import real from ${JSON.stringify(`node:${name}`)}`,
    `import { heldRefusal, noteOutside, outsideHeld } from ${JSON.stringify(engine)}`,
    `const ways = ${JSON.stringify(ways)}`,
    "const notes = (key) => typeof key === 'string' && (ways === true ? /^[a-z]/.test(key) : ways.includes(key))",
    `const noting = (owner, key) => function (...given) { const what = ${JSON.stringify(`node:${name} `)} + key; ${held ? 'if (outsideHeld()) throw heldRefusal("A connection of the app by " + what); ' : ''}noteOutside(what); return Reflect.apply(owner[key], this, given) }`,
    "const all = (owner) => new Proxy(owner, { get: (target, key) => notes(key) && typeof target[key] === 'function' ? noting(target, key) : Reflect.get(target, key) })",
    'export default all(real)',
  ]
  for (const [key, one] of Object.entries(given)) {
    if (key === 'default') continue
    const at = JSON.stringify(key)
    if (key === 'promises' && name === 'fs') lines.push(`export const promises = all(real.promises)`)
    else if (typeof one === 'function' && notes(key)) lines.push(`export const ${key} = noting(real, ${at})`)
    else lines.push(`export const ${key} = real[${at}]`)
  }
  return lines.join('\n')
}

/**
 * The path of a module of the project from its folder, with `/`, or nothing for a package, a file elsewhere, or a
 * module of the app's code that the engine loaded: what that stands on is the fingerprint of its definition.
 */
function placeOf(url: string): string | undefined {
  if (!url.startsWith(project) || new URL(url).searchParams.has('tent-app')) return undefined
  const place = relative(folder, fileURLToPath(url.split('?')[0]))
    .split(sep)
    .join('/')
  return /(?:^|\/)(?:node_modules|\.tent)(?:\/|$)/.test(place) ? undefined : place
}

registerHooks({
  resolve(name, context, next) {
    const bare = name.replace(/^node:/, '')
    if (ofApp(context.parentURL)) {
      if (name === 'node:test') return { url: face, shortCircuit: true }
      if (Object.hasOwn(noting, bare)) return { url: `${scheme}${bare}`, shortCircuit: true }
    }
    return next(name, context)
  },
  load(url, context, next) {
    const name = url.startsWith(scheme) ? url.slice(scheme.length) : undefined
    if (name !== undefined && Object.hasOwn(noting, name))
      return { format: 'module', source: notingText(name), shortCircuit: true }
    const loaded = next(url, context)
    const place = placeOf(url)
    if (place !== undefined) {
      // The file as it lies, whatever a hook made of it: the key holds it by its bytes.
      noteLoaded(place, fingerprintOf(files.readFileSync(fileURLToPath(url.split('?')[0]))))
      // A file that is no code, as a fixture read by `require`, is read as a file is.
      if (loaded.format === 'json' && testUnderWay() !== undefined) noteOutside(`file ${place}`)
    }
    return loaded
  },
})

// The ports this program serves on: a request to one of them asks this program, and leaves nothing.
const served = new Set<number>()
const listen = net.Server.prototype.listen
Reflect.set(net.Server.prototype, 'listen', function (this: net.Server, ...given: unknown[]): unknown {
  this.once('listening', () => {
    const at = this.address()
    if (typeof at === 'object' && at !== null) served.add(at.port)
  })
  return Reflect.apply(listen, this, given)
})
const own = new Set(['localhost', '127.0.0.1', '[::1]'])

// A plain `fetch` made in the work of a test that leaves this program reached outside.
const plainFetch = globalThis.fetch
globalThis.fetch = (asked, init) => {
  const address = asked instanceof Request ? asked.url : String(asked)
  if (testUnderWay() !== undefined && URL.canParse(address)) {
    const url = new URL(address)
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
    if (!(own.has(url.hostname) && served.has(port))) noteOutside(`fetch ${url.host}`)
  }
  return plainFetch(asked, init)
}

// Each word of the environment that the test or the app's code reads is noted with its value.
noteWordsRead()
