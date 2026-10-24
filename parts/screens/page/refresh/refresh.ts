// The part of Fast Refresh, in the development form of the page code alone. A page of the mode `development` loads it
// before the main file, as Vite's plug-in for React puts its preamble before the page's own modules: React's renderer
// finds the hook of the runtime only where it lies there before React starts.
import type { Refreshing, View } from '../refreshing.ts'
import {
  createSignatureFunctionForTransform,
  injectIntoGlobalHook,
  performReactRefresh,
  register,
  setSignature,
} from '../../borrowed/refresh.ts'

injectIntoGlobalHook(window)

// The modules of development that the page holds, by their addresses in the bundle, and the addresses they ran from.
const held = new Set<string>()
const ran = new Set<string>()

const isView = (type: unknown): type is View => typeof type === 'function'

// The component that the page draws a view through, as the main file tells it, and the signature that the transform
// gave each component: the drawing of a view is its family, so it takes the view's signature too.
let drawingOf = (view: View): unknown => view
const signed = new WeakMap<object, { key: string; reset: boolean; hooks: (() => unknown[]) | undefined }>()

const refreshing: Refreshing = {
  register(type, id, reset) {
    const family = id.endsWith('$view') && isView(type) ? drawingOf(type) : type
    const signature = isView(type) ? signed.get(type) : undefined
    if (family !== type && signature) setSignature(family, signature.key, signature.reset, signature.hooks)
    // A component of a file that says `// @refresh reset` has a signature that mounts it anew, also with no hook.
    else if (reset) setSignature(family, '', true)
    register(family, id)
  },
  views(drawing) {
    drawingOf = drawing
  },
  sign(reset) {
    const sign = createSignatureFunctionForTransform()
    return (type, key, forceReset, hooks) => {
      if (typeof key !== 'string') return sign()
      if (isView(type)) signed.set(type, { key, reset: reset || forceReset === true, hooks })
      return sign(type, key, reset || forceReset, hooks)
    }
  },
  held: (address, from) => {
    held.add(address)
    ran.add(from)
  },
  ran: (from) => ran.has(from),
  holds: (address) => held.has(address),
  refreshed: () => void performReactRefresh(),
}

globalThis.__tentRefresh = refreshing
