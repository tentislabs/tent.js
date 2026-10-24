import type { Step } from '../work.ts'

/**
 * Records `verified: true` on each route whose file imports `verified` from `tentjs`: the engine keeps the bytes of
 * a request only for such a route, so a route that takes a large upload keeps nothing.
 */
export const step: Step = {
  order: 4.3,
  run: async (work) => {
    if (!work.description) return
    for (const loaded of work.loaded) {
      const name: unknown = Reflect.get(loaded.value, 'definition')
      if (Reflect.get(loaded.value, 'kind') !== 'route' || typeof name !== 'string') continue
      const stored = work.description.routes[name]
      const file = work.files.get(loaded.file ?? '')
      // A file that the reader could not read is searched as text for the import.
      const imports = file?.seen
        ? file.seen.imports.some((one) => one.name === 'verified' && one.from === 'tentjs')
        : /import\s*\{[^}]*\bverified\b[^}]*\}\s*from\s*['"]tentjs['"]/.test(file?.text ?? '')
      if (stored && imports) stored.verified = true
    }
  },
}
