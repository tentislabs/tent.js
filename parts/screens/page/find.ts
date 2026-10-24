import { registerHooks } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { handedOn } from '../../core/internal.ts'
import { names } from './names.ts'

// The folders that this page code answers for, each as the address its files start with.
const folders: string[] = []

let hooked = false

// What the made-up address of a name starts with: one page code answers for its own, and no other does.
const mark = `tent-page:${Math.random().toString(36).slice(2)}/`

// Each module of a package that a view names by `tent-package:<file>`, by its file, with the address it was first
// found at: every version that holds a file of that name is answered with one module, loaded once. The name of the
// file holds the fingerprint of what was built, so a package built anew is another file.
const packages = new Map<string, string>()

/** The text of the small module of one name, which hands on what this page code holds under it. */
const textOf = (name: string): string => handedOn(name, Object.hasOwn(names, name) ? names[name] : {}, import.meta.url)

/**
 * Takes a folder. Sets the runtime's own hook for finding a module, once, and adds the folder to the ones it
 * answers for: a module that lies in one of them and imports one of the six names of the page code is answered
 * with what `names` holds for it. Every other module of the program finds its imports as before.
 */
export function findPageCode(folder: string): void {
  const under = `${pathToFileURL(resolve(folder)).href}/`
  if (!folders.includes(under)) folders.push(under)
  if (hooked) return
  hooked = true
  registerHooks({
    resolve: (name, context, next) => {
      const from = context.parentURL
      // A module that this page code made up imports this page code itself, which is loaded already: its address is
      // answered as it is, with no file asked for, also once the bundle it was first loaded from is gone. It is known
      // by the name alone: a made-up module that a `require` loads is handed an address of a file as its own.
      if (name === import.meta.url) return { url: name, shortCircuit: true }
      const under = from !== undefined && folders.some((one) => from.startsWith(one))
      if (under && name.startsWith('tent-package:')) {
        const file = name.slice('tent-package:'.length)
        const url = packages.get(file) ?? new URL(file, from).href
        packages.set(file, url)
        return { url, shortCircuit: true }
      }
      const ours = Object.hasOwn(names, name) && under
      return ours ? { url: `${mark}${name}`, format: 'module', shortCircuit: true } : next(name, context)
    },
    load: (url, context, next) =>
      url.startsWith(mark)
        ? { format: 'module', source: textOf(url.slice(mark.length)), shortCircuit: true }
        : next(url, context),
  })
}

export { names }
