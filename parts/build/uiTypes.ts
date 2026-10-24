import type { Description } from '../core/internal.ts'
import { isStored } from '../core/internal.ts'

/** A stored type as the type checker reads a value of it in a view: a moment travels as text. */
function handedAs(type: unknown): string {
  if (!isStored(type)) return 'unknown'
  const values = Array.isArray(type.values) ? type.values : []
  const shape = isStored(type.shape) ? type.shape : {}
  switch (type.kind) {
    case 'text':
    case 'day':
    case 'date':
    case 'file':
    case 'link':
      return 'string'
    case 'number':
    case 'boolean':
      return type.kind
    case 'choice':
      return values.map((one) => JSON.stringify(one)).join(' | ') || 'never'
    case 'list':
      return `(${handedAs(type.of)})[]`
    case 'vector':
      return 'number[]'
    case 'object':
      return `{ ${Object.entries(shape)
        .map(
          ([name, one]) =>
            `${JSON.stringify(name)}${isStored(one) && one.optional === true ? '?' : ''}: ${handedAs(one)}`,
        )
        .join('; ')} }`
    default:
      return 'unknown'
  }
}

/**
 * Takes the description of a project. Answers the text that the type list gives a screen file: the keys of the
 * default language, and the state of `project`, inside the lists that `tentjs/ui` declares empty.
 */
export function uiTypeList(description: Description): string {
  const state = Object.entries(isStored(description.project.state) ? description.project.state : {})
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, entry]) => {
      const type = isStored(entry) && isStored(entry.type) ? entry.type : entry
      // A state that is optional and states no default starts as nothing.
      const nothing = isStored(type) && type.optional === true && type.default === undefined ? ' | undefined' : ''
      return `    ${JSON.stringify(name)}: ${handedAs(type)}${nothing}`
    })
  // The keys of the default language, which a view names in `message(...)`.
  const languages = Array.isArray(description.project.languages) ? description.project.languages.map(String) : []
  const stored: Record<string, unknown> = isStored(description.messages) ? description.messages : {}
  const first = isStored(stored[languages[0] ?? 'en']) ? Object(stored[languages[0] ?? 'en']) : {}
  const keys = Object.keys(first)
    .sort()
    .map((key) => `    ${JSON.stringify(key)}: string`)
  const lists = [
    keys.length ? `  interface Messages {\n${keys.join('\n')}\n  }` : '  interface Messages {}',
    state.length ? `  interface AppState {\n${state.join('\n')}\n  }` : '  interface AppState {}',
  ]
  return `declare module 'tentjs/ui' {\n${lists.join('\n')}\n}\n`
}
