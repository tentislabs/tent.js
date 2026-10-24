import assert from 'node:assert/strict'
import { test } from 'node:test'
import { performReactRefresh } from '../borrowed/refresh.ts'
import { drawingOf } from '../page/view.tsx'

/** The families that a refresh kept the state of, and those it mounts anew, as React's runtime answers them. */
function refreshedFamilies(): { kept: unknown[]; anew: unknown[] } {
  const done: unknown = performReactRefresh()
  const currents = (set: unknown): unknown[] =>
    set instanceof Set ? [...set].map((family: unknown) => Reflect.get(Object(family), 'current')) : []
  return {
    kept: currents(Reflect.get(Object(done), 'updatedFamilies')),
    anew: currents(Reflect.get(Object(done), 'staleFamilies')),
  }
}

test('[31-22] the part refresh registers the component that the page draws a view through as the family of the view, with the signature of the view: a save that keeps the hooks keeps its state, and one that changes them mounts it anew', async () => {
  Reflect.set(globalThis, 'window', globalThis)
  await import('../page/refresh/refresh.ts')
  const refreshing = globalThis.__tentRefresh
  assert.ok(refreshing)
  refreshing.views(drawingOf)
  /** A view as a module of development makes it: signed by the transform, then registered by the end of its module. */
  const saved = (hooks: string): ((handed: Record<string, unknown>) => null) => {
    const view = (_handed: Record<string, unknown>): null => null
    refreshing.sign(false)(view, hooks)
    refreshing.register(view, 'screens/count.tsx countScreen$view', false)
    return view
  }
  saved('useState{[count](0)}')
  const same = saved('useState{[count](0)}')
  assert.deepEqual(refreshedFamilies(), { kept: [drawingOf(same)], anew: [] })
  const other = saved('useState{[count](1)}')
  assert.deepEqual(refreshedFamilies(), { kept: [], anew: [drawingOf(other)] })
})
