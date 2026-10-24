import { registerHooks } from 'node:module'

// The packages of the build, React among them, lie with the build tools: in a direct install that is a layer of
// its own beside the player, from whose files the runtime does not find them. A package that a file of the player
// names for the build, and that is not found from there, is found from here, as the build's own.
const here = import.meta.url

/** Whether an import names a package, and not a file, an address or a module of the runtime. */
const isPackage = (name: string): boolean => /^(@[^/]+\/)?[^./:@][^:]*$/.test(name)

registerHooks({
  resolve(name, context, next) {
    try {
      return next(name, context)
    } catch (error) {
      if (!isPackage(name) || Reflect.get(Object(error), 'code') !== 'ERR_MODULE_NOT_FOUND') throw error
      return next(name, { ...context, parentURL: here })
    }
  },
})
