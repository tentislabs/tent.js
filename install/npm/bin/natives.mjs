// Under the npm door the program files of a system lie apart from the code that loads them, in the package of the
// system or where the launcher laid them: each name of such a package is found there, by every import and require.
import { existsSync, readdirSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const at = new URL(import.meta.url).searchParams.get('at') ?? ''
const modules = join(at, 'node_modules')
const names = new Set()
if (existsSync(modules))
  for (const one of readdirSync(modules)) {
    if (!one.startsWith('@')) names.add(one)
    else for (const inner of readdirSync(join(modules, one))) names.add(`${one}/${inner}`)
  }

/** The name of the package that a bare import names, with its scope. */
const packageOf = (specifier) => specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/')

// Found from inside the folder that holds them, as the package that asked would find its own. The finding itself
// asks these hooks again, which then hand it on as it is.
const local = createRequire(join(at, 'natives.js'))
let finding = false
registerHooks({
  resolve(specifier, context, next) {
    if (finding || !names.has(packageOf(specifier))) return next(specifier, context)
    finding = true
    try {
      return { url: pathToFileURL(local.resolve(specifier)).href, shortCircuit: true }
    } finally {
      finding = false
    }
  },
})
