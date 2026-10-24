import type { PartName } from './parts.ts'

/**
 * The one list of the parts of the page code, each by its name with what loads it. A browser loads a part when it
 * needs it, and a part holds itself when it is loaded, so a page that names the file of a part among the files it
 * loads needs none of this: it is for a view that draws a tag of a part which the build could not see. A server
 * loads every part of the list from the start.
 */
export const loaders: Record<PartName, () => Promise<unknown>> = {
  above: () => import('./above/above.tsx'),
  agent: () => import('./agent/agent.ts'),
  exported: () => import('./exported/exported.ts'),
  form: () => import('./form/form.tsx'),
  image: () => import('./image/image.tsx'),
  inspect: () => import('./inspect/inspect.ts'),
  mic: () => import('./mic/mic.ts'),
  overlay: () => import('./overlay/overlay.ts'),
  posted: () => import('./posted/posted.ts'),
  scripts: () => import('./scripts/scripts.ts'),
  served: () => import('./served/served.tsx'),
  tested: () => import('./tested/tested.ts'),
  values: () => import('./values/values.ts'),
  vitals: () => import('./vitals/vitals.ts'),
}

/** Whether a text is the name of a part of the page code. */
export const isPart = (name: string): name is PartName => Object.hasOwn(loaders, name)
