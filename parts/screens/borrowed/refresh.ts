// The one place of this part that imports React's own runtime of Fast Refresh, which only the part `refresh` of the
// development form of the page code holds. The package ships no types: what it gives is typed here, as its readme
// and the runtime's own source say it (github.com/facebook/react, packages/react-refresh/src/ReactFreshRuntime.js).
// @ts-expect-error The package holds no declaration of its types.
import given from 'react-refresh/runtime'

/** What the runtime of Fast Refresh gives, by the names its readme gives it. */
interface Runtime {
  injectIntoGlobalHook(globalObject: object): void
  register(type: unknown, id: string): void
  setSignature(type: unknown, key: string, forceReset?: boolean, getCustomHooks?: () => unknown[]): void
  createSignatureFunctionForTransform(): (
    type?: unknown,
    key?: string,
    forceReset?: boolean,
    getCustomHooks?: () => unknown[],
  ) => unknown
  performReactRefresh(): unknown
}

// The package is read through the shape its readme gives, which no declaration of its own states.
const runtime = given as unknown as Runtime

export const injectIntoGlobalHook = (globalObject: object): void => runtime.injectIntoGlobalHook(globalObject)
export const register = (type: unknown, id: string): void => runtime.register(type, id)
export const setSignature = (type: unknown, key: string, forceReset: boolean, getCustomHooks?: () => unknown[]): void =>
  runtime.setSignature(type, key, forceReset, getCustomHooks)
export const createSignatureFunctionForTransform = (): ReturnType<Runtime['createSignatureFunctionForTransform']> =>
  runtime.createSignatureFunctionForTransform()
export const performReactRefresh = (): unknown => runtime.performReactRefresh()
