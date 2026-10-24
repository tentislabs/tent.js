import assert from 'node:assert/strict'
import { test } from 'node:test'

test('[31-22] the part refresh lays React runtime of Fast Refresh on the page before React starts: it knows each module the page holds, signs the hooks of a component, and with // @refresh reset gives every component a signature that mounts it anew', async () => {
  // The part runs on a page, where the window is the page itself; React's own hook of tools is laid on it.
  Reflect.set(globalThis, 'window', globalThis)
  await import('../page/refresh/refresh.ts')
  assert.equal(typeof Reflect.get(globalThis, '__REACT_DEVTOOLS_GLOBAL_HOOK__'), 'object')
  const refreshing = globalThis.__tentRefresh
  assert.ok(refreshing)
  refreshing.held(
    'browser/src.screens.count.tsx.js',
    'http://localhost/_t/b/browser/src.screens.count.tsx.js?v=0123456789ab',
  )
  assert.equal(refreshing.holds('browser/src.screens.count.tsx.js'), true)
  assert.equal(refreshing.holds('browser/src.other.tsx.js'), false)
  // It knows each address a module ran from, so a mark that comes back runs the module anew.
  assert.equal(refreshing.ran('http://localhost/_t/b/browser/src.screens.count.tsx.js?v=0123456789ab'), true)
  assert.equal(refreshing.ran('http://localhost/_t/b/browser/src.screens.count.tsx.js?v=ba9876543210'), false)
  // A component is signed as the transform signs it, and is answered as it was handed.
  const view = (): null => null
  assert.equal(refreshing.sign(false)(view, 'useState{[count](0)}'), view)
  // With nothing pending, drawing again draws nothing and fails nothing.
  refreshing.register(view, 'screens/count.tsx countScreen$view', true)
  refreshing.refreshed()
})
