import * as files from 'node:fs'
import * as promised from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

// Loaded into the program of each test file of an app under `tent test`, before the file itself. What the test file
// imports as `node:test` is the face that runs each test as its own work, and what it and the app's code import as
// `node:fs` notes that the test under way reached a file outside what the engine holds for it.

const face = new URL('./testFace.ts', import.meta.url).href
const engine = new URL('../engine/index.ts', import.meta.url).href
const project = `${pathToFileURL(process.cwd()).href}/`
// The scheme of the modules of `node:fs` that note each use.
const scheme = 'tent-noted:'

/** Whether a module is the app's: a file of its project that is no package, or a module of its code the engine loaded. */
function ofApp(parent: string | undefined): boolean {
  if (parent === undefined || !parent.startsWith('file:')) return false
  if (new URL(parent).searchParams.has('tent-app')) return true
  return parent.startsWith(project) && !parent.includes('/node_modules/')
}

/**
 * The text of a module that gives what a module of the files gives, each function whose name begins in lowercase
 * noting first that the test under way reached outside: a constant, a class and the default are given as they are,
 * but for the promises of `node:fs`, whose functions note too.
 */
function notingText(name: string, given: Record<string, unknown>): string {
  const lines = [
    `import real from ${JSON.stringify(`node:${name}`)}`,
    `import { noteOutside } from ${JSON.stringify(engine)}`,
    `const noting = (owner, key) => function (...given) { noteOutside(${JSON.stringify(`node:${name} `)} + key); return Reflect.apply(owner[key], this, given) }`,
    "const all = (owner) => new Proxy(owner, { get: (target, key) => typeof key === 'string' && /^[a-z]/.test(key) && typeof target[key] === 'function' ? noting(target, key) : Reflect.get(target, key) })",
    'export default all(real)',
  ]
  for (const [key, one] of Object.entries(given)) {
    if (key === 'default') continue
    const at = JSON.stringify(key)
    if (key === 'promises') lines.push(`export const promises = all(real.promises)`)
    else if (typeof one === 'function' && /^[a-z]/.test(key)) lines.push(`export const ${key} = noting(real, ${at})`)
    else lines.push(`export const ${key} = real[${at}]`)
  }
  return lines.join('\n')
}

const noting: Record<string, Record<string, unknown>> = { fs: files, 'fs/promises': promised }

registerHooks({
  resolve(name, context, next) {
    if (ofApp(context.parentURL)) {
      if (name === 'node:test') return { url: face, shortCircuit: true }
      const bare = name.replace(/^node:/, '')
      if (Object.hasOwn(noting, bare)) return { url: `${scheme}${bare}`, shortCircuit: true }
    }
    return next(name, context)
  },
  load(url, context, next) {
    const name = url.startsWith(scheme) ? url.slice(scheme.length) : undefined
    if (name === undefined || !Object.hasOwn(noting, name)) return next(url, context)
    return { format: 'module', source: notingText(name, noting[name]), shortCircuit: true }
  },
})
