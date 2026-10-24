// A program of its own that loads the room runtime into a `node:vm` context which holds no module and no global of
// the runtime, loads a version of one module through it, and answers a code query through ways the program gives.
// Run: node --experimental-vm-modules load.mjs
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const rooms = fileURLToPath(new URL('../../rooms/', import.meta.url))
const context = vm.createContext({})
// What the context holds: the language's own globals, and nothing of the runtime.
const held = vm.runInContext('Object.getOwnPropertyNames(globalThis)', context)
const ofRuntime = ['process', 'Buffer', 'require', 'setTimeout', 'setInterval', 'setImmediate', 'fetch']
const leaked = ofRuntime.filter((name) => held.includes(name))

const modules = new Map()
/** The module of a file of the framework, made in the context from its source with the types taken out. */
function moduleOf(file) {
  let made = modules.get(file)
  if (made) return made
  const text = readFileSync(file, 'utf8')
  const source = file.endsWith('.ts') ? stripTypeScriptTypes(text) : text
  made = new vm.SourceTextModule(source, { context, identifier: file })
  modules.set(file, made)
  return made
}

// The one module of the version: a code query that counts the rows of a table through the `db` it is handed.
const version = new vm.SourceTextModule(
  'export const counted = { options: { run: ({ db, input }) => db.notes.count() + input.more } }',
  { context, identifier: 'version:counted.js' },
)

// A word of `core` names a module of the runtime for pure work, as a fingerprint: a host gives such a module. The
// context is given each as members that refuse, and is told which of them was used. No other file names one.
const core = resolve(rooms, '..', '..', 'core')
const given = []
function runtimeModule(name, from) {
  if (!from.identifier.startsWith(core))
    throw new Error(`${from.identifier} imports ${name}, which the context does not hold`)
  const asked = new Set()
  const text = readFileSync(from.identifier, 'utf8')
  for (const line of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g))
    if (line[2] === name) for (const one of line[1].split(',')) asked.add(one.trim().split(/\s+as\s+/)[0])
  const names = [...asked].filter(Boolean)
  return new vm.SyntheticModule(
    names,
    function () {
      for (const one of names)
        this.setExport(
          one,
          new Proxy(() => undefined, {
            get: () => {
              given.push(`${name} ${one}`)
              return undefined
            },
            apply: () => {
              given.push(`${name} ${one}`)
              return undefined
            },
          }),
        )
    },
    { context, identifier: `${name} for ${from.identifier}` },
  )
}

async function linker(name, from) {
  if (name.startsWith('node:')) return runtimeModule(name, from)
  if (!name.startsWith('.')) throw new Error(`${from.identifier} imports ${name}, which the context does not hold`)
  return moduleOf(resolve(dirname(from.identifier), name))
}

const inside = moduleOf(join(rooms, 'inside', 'inside.ts'))
await inside.link(linker)
await inside.evaluate()
await version.link(linker)
await version.evaluate()

let current
const asked = []
const insideOf = inside.namespace.insideOf
const room = insideOf({
  ways: {
    runtime: () => {
      throw new Error('no word is asked')
    },
    db(call, db, member, args) {
      asked.push({ call, db, member, plan: args[0] })
      return 41
    },
    back: () => undefined,
    fetch: async () => undefined,
  },
  carry: {
    run(call, work) {
      const before = current
      current = call
      try {
        return work()
      } finally {
        current = before
      }
    },
    current: () => current,
  },
  link: async () => version.namespace,
  page: async () => {
    throw new Error('no page is drawn')
  },
})
await room.load({ id: 'v1', modules: [{ path: 'counted.js', kinds: ['query'] }] })
const entry = room.entry('v1', { kind: 'query', module: 'counted.js', path: ['counted', 'options', 'run'] })
const db = { '\u0000tent': 'db', n: 1, tables: ['notes'], mode: 'read', full: false }
const answer = room.call(entry, 7, [{ db, input: { more: 1 } }], {
  pure: true,
  bounds: { depth: 64, size: 1000 },
})
process.stdout.write(`${JSON.stringify({ leaked, answer, asked, given })}\n`)
