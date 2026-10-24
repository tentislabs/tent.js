import type { PageStore } from '../store.ts'
import { inspecting } from './speak.ts'

// Whether the page waits for itself to come alive, to speak to its tool from then on.
let waiting = false

/**
 * In a browser: speaks to the tool once the page has come alive, which its root says by `data-t-alive`, whatever
 * the page draws.
 */
export function whenAlive(store: PageStore): void {
  if (waiting || typeof window === 'undefined') return
  waiting = true
  const root = document.querySelector('body > div#tent')
  if (!root) return
  if (root.hasAttribute('data-t-alive')) {
    inspecting({ store })
    return
  }
  const watch = new MutationObserver(() => {
    if (!root.hasAttribute('data-t-alive')) return
    watch.disconnect()
    inspecting({ store })
  })
  watch.observe(root, { attributes: true, attributeFilter: ['data-t-alive'] })
}
