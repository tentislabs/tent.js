import type { Description } from '../../../core/internal.ts'
import { isStored } from '../../../core/internal.ts'

/** The screens and components that drawing the named ones draws: what each uses and the layout it is shown in, however deep. */
function drawnBy(description: Description, names: string[]): string[] {
  const seen = new Set<string>()
  const next = [...names]
  for (let name = next.pop(); name !== undefined; name = next.pop()) {
    if (seen.has(name)) continue
    seen.add(name)
    const record: unknown = Object.hasOwn(description.screens, name)
      ? description.screens[name]
      : Object.hasOwn(description.components, name)
        ? description.components[name]
        : undefined
    if (!isStored(record)) continue
    if (Array.isArray(record.uses)) next.push(...record.uses.map(String))
    for (const around of [record.layout, record.loading]) if (typeof around === 'string') next.push(around)
  }
  return [...seen]
}

/**
 * Takes how a module of a view is loaded. Answers what answers the records of the views that a draw of the named
 * screens and components draws, by the description, each loaded once, when a page first draws it.
 */
export function viewsLoader(
  load: (file: string) => Promise<Record<string, unknown>>,
): (description: Description, names: string[]) => Promise<Record<string, object>> {
  const loaded = new Map<string, Promise<object>>()
  return async (description, names) => {
    const server: Record<string, unknown> = Object(description.server)
    const files: Record<string, unknown> = isStored(server.views) ? server.views : {}
    const views: Record<string, object> = {}
    for (const name of drawnBy(description, names)) {
      const file = Object.hasOwn(files, name) ? files[name] : undefined
      if (typeof file !== 'string') continue
      let view = loaded.get(name)
      if (!view) {
        view = load(file).then((one) => Object(one.default))
        loaded.set(name, view)
      }
      views[name] = await view
    }
    return views
  }
}
