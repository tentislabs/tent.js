import type { AsyncLocalStorage } from 'node:async_hooks'

/**
 * The store of the runtime, taken where the runtime has one and imported by no module: a browser loads the page
 * code with no part of the server in it, and there it holds none.
 */
function storeOfRuntime(): AsyncLocalStorage<true> | undefined {
  const host: unknown = Reflect.get(globalThis, 'process')
  const builtin: unknown = Reflect.get(Object(host), 'getBuiltinModule')
  if (typeof builtin !== 'function') return undefined
  const hooks: unknown = Reflect.apply(builtin, host, ['node:async_hooks'])
  const Store: unknown = Reflect.get(Object(hooks), 'AsyncLocalStorage')
  return typeof Store === 'function' ? Reflect.construct(Store, []) : undefined
}

// Kept for the work and all it waits for, so a file loaded inside it is inside it when its module runs, and no other
// call is. A browser holds no such store and makes no definition: a value word of a view is carried out at once.
const making = storeOfRuntime()

/**
 * Takes a piece of work in which definitions are made, as the loading of a file. Carries it out and answers what
 * it answers. Inside it a word that asks the engine, and a setting, answer their record, whoever is calling.
 */
export function describing<Made>(work: () => Made): Made {
  return making ? making.run(true, work) : work()
}

/** Whether a definition is being made. */
export const isDescribing = (): boolean => making?.getStore() === true
