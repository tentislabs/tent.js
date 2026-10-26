import fs from 'node:fs'
import * as files from 'node:fs'
import * as promised from 'node:fs/promises'
import { registerHooks, syncBuiltinESMExports } from 'node:module'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import workerThreads, { threadId } from 'node:worker_threads'
import { fingerprintOf } from '../core/internal.ts'
import {
  calledByApp,
  handLine,
  isAppModule,
  leavesProgram,
  linesHanded,
  noteAllAs,
  noteLoaded,
  noteOutside,
  noteWaysOut,
  noteWordsRead,
  outsideHeld,
  tellNotesTo,
  testUnderWay,
  toldAsItEnds,
  writeNotes,
  writeToldNotes,
} from '../engine/index.ts'

// Loaded into the program of each test file of an app under `tent test`, before the file itself, and into each
// program of the runtime that a test starts. What the test file imports as `node:test` is the face that runs each
// test as its own work. What it and the app's code import as `node:fs` notes that the test under way reached outside
// what the engine holds for it, and so does every way out of the program; where the program holds what reaches
// outside, a way out is refused. Each module of the project that the program loads is noted with its fingerprint,
// and each word of the environment a test reads with its value. A program that a test started is that test's work
// as a whole: each file of the project it reads reached outside, and it writes its notes as it ends.

const face = new URL('./testFace.ts', import.meta.url).href
const engine = new URL('../engine/index.ts', import.meta.url).href
// The test that started this program, and the folder of its project, where a test started it.
const started = process.env.TENT_STARTED_TEST
const folder = process.env.TENT_STARTED_FOLDER ?? process.cwd()
const project = `${pathToFileURL(folder).href}/`
// The scheme of the modules of the runtime that note each use.
const scheme = 'tent-noted:'

/** Whether a module is the app's: a file of its project that is no package, or a module of its code the engine loaded. */
const ofApp = (parent: string | undefined): boolean => parent !== undefined && isAppModule(parent, project)

// The modules of the files, whose every function whose name begins in lowercase notes.
const noting: Record<string, Record<string, unknown>> = { fs: files, 'fs/promises': promised }

/**
 * The text of a module that gives what a module of the files gives, each function whose name begins in lowercase
 * noting first that the test under way reached outside: a constant, a class and the default are given as they are,
 * but for the promises of `node:fs`, whose functions note too.
 */
function notingText(name: string): string {
  const lines = [
    `import real from ${JSON.stringify(`node:${name}`)}`,
    `import { noteOutside } from ${JSON.stringify(engine)}`,
    `const noting = (owner, key) => function (...given) { noteOutside(${JSON.stringify(`node:${name} `)} + key); return Reflect.apply(owner[key], this, given) }`,
    "const all = (owner) => new Proxy(owner, { get: (target, key) => typeof key === 'string' && /^[a-z]/.test(key) && typeof target[key] === 'function' ? noting(target, key) : Reflect.get(target, key) })",
    'export default all(real)',
  ]
  for (const [key, one] of Object.entries(noting[name])) {
    if (key === 'default') continue
    const at = JSON.stringify(key)
    if (key === 'promises') lines.push(`export const promises = all(real.promises)`)
    else if (typeof one === 'function' && /^[a-z]/.test(key)) lines.push(`export const ${key} = noting(real, ${at})`)
    else lines.push(`export const ${key} = real[${at}]`)
  }
  return lines.join('\n')
}

/** The path of a file of the project from its folder, with `/`, or nothing for a package or a file elsewhere. */
function placeIn(path: string): string | undefined {
  const place = relative(folder, resolve(path)).split(sep).join('/')
  if (place === '' || place.startsWith('..') || isAbsolute(place)) return undefined
  return /(?:^|\/)(?:node_modules|\.tent)(?:\/|$)/.test(place) ? undefined : place
}

/**
 * The path of a module of the project from its folder, or nothing for a package, a file elsewhere, or a module of the
 * app's code that the engine loaded: what that stands on is the fingerprint of its definition.
 */
const placeOf = (url: string): string | undefined =>
  !url.startsWith(project) || new URL(url).searchParams.has('tent-app')
    ? undefined
    : placeIn(fileURLToPath(url.split('?')[0]))

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

// A program of the runtime that a test starts carries this noting, as a part of that test.
const carry = (test: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  ...env,
  NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --import=${import.meta.url}`.trim(),
  TENT_STARTED_TEST: test,
  TENT_STARTED_FOLDER: folder,
  ...(process.env.TENT_TOUCHED ? { TENT_TOUCHED: process.env.TENT_TOUCHED } : {}),
  ...(outsideHeld() ? { TENT_HELD_OUTSIDE: '1' } : {}),
})
noteWaysOut({ carry })

// A plain `fetch` made in the work of a test that leaves this program reached outside: also over a connection that
// an earlier test opened, which no connect of the socket tells.
const plainFetch = globalThis.fetch
globalThis.fetch = (asked, init) => {
  const address = asked instanceof Request ? asked.url : String(asked)
  if (testUnderWay() !== undefined && URL.canParse(address)) {
    const url = new URL(address)
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
    if (leavesProgram(url.hostname, port)) noteOutside(`fetch ${url.host}`)
  }
  return plainFetch(asked, init)
}

if (started !== undefined) {
  // A carried thread hands each note to its program as it takes it: a thread held on a lock and then ended runs no
  // end of its own.
  if (threadId !== 0) tellNotesTo((line) => void handLine('notes', `${line}\n`))
  noteAllAs(started)
  // Each way of the files that reads a file by its path notes a file of the project that is read: the program is
  // the test's own, whatever module reads.
  const reading = (owner: object, names: string[]): void => {
    for (const name of names) {
      const own: unknown = Reflect.get(owner, name)
      if (typeof own !== 'function') continue
      const way = function (this: unknown, ...given: unknown[]): unknown {
        const path = typeof given[0] === 'string' ? given[0] : given[0] instanceof URL ? fileURLToPath(given[0]) : ''
        const place = path === '' ? undefined : placeIn(path)
        if (place !== undefined) noteOutside(`file ${place}`)
        return Reflect.apply(own, this, given)
      }
      Reflect.set(owner, name, Object.assign(way, own))
    }
  }
  const ways = ['readFile', 'readdir', 'open', 'opendir', 'cp', 'copyFile']
  reading(fs, [...ways, ...ways.map((one) => `${one}Sync`), 'createReadStream'])
  reading(fs.promises, ways)
  syncBuiltinESMExports()
  const notes = process.env.TENT_TOUCHED
  const write = (): void => {
    if (notes) writeNotes(notes, `${process.pid}-${threadId}-started`)
  }
  process.once('exit', write)
}

// A thread that the test's or the app's code starts in the work of a test carries this noting and the hold, as a
// program of the runtime it starts does: all its work is the test's. The notes it hands as it takes them are written
// as it ends, beside those it writes itself as it ends by itself.
const Started = workerThreads.Worker
class Carried extends Started {
  constructor(file: string | URL, options: workerThreads.WorkerOptions = {}) {
    const test = testUnderWay()
    const env: unknown = options.env ?? process.env
    const carried =
      (test !== undefined || outsideHeld()) &&
      typeof env === 'object' &&
      env !== null &&
      calledByApp(Carried, [import.meta.url], project)
    if (!carried) {
      super(file, options)
      return
    }
    const address =
      file instanceof URL ? file.href : file.startsWith('file:') ? file : pathToFileURL(resolve(file)).href
    const code = options.eval ? String(file) : `import(${JSON.stringify(address)})`
    const handed = linesHanded('notes', `import(${JSON.stringify(import.meta.url)}).then(() => {\n${code}\n})`, {
      ...options,
      env: { ...Object(env), ...carry(test ?? 'held', Object(env)) },
    })
    super(handed.code, handed.options)
    const notes = process.env.TENT_TOUCHED
    const name = `${process.pid}-${this.threadId}-handed`
    toldAsItEnds(this, handed.memory, (lines) => {
      if (notes) writeToldNotes(notes, name, lines)
    })
  }
}
Reflect.set(workerThreads, 'Worker', Carried)
syncBuiltinESMExports()

// Each word of the environment that the test or the app's code reads is noted with its value.
noteWordsRead()
