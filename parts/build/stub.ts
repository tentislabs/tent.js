import type { Description, StubbedDefinition } from '../core/internal.ts'
import type { Declared } from './read/scan.ts'
import type { Work } from './work.ts'
import { isStored, stubOf } from '../core/internal.ts'

/**
 * Takes a description, and a definition as its file writes it. Answers the record that a screen file is handed in
 * its place, as `stubOf` of `core` gives it. A definition that the description does not hold yet reaches a
 * screen as its name and its kind alone: a screen file is run before the screens are described.
 */
export function declaredStub(description: Description, declared: Declared): StubbedDefinition {
  const name = declared.name ?? declared.exportName
  const kind = declared.word === 'python' ? 'action' : declared.word
  return stubOf(description, name) ?? { definition: name, kind, ...(kind === 'screen' ? { state: [] } : {}) }
}

/**
 * Takes the work of a build, its description and the name of a definition. Answers what a screen holds of it: the
 * stub of a definition of a backend file, or of a screen, and nothing for a name that is neither.
 */
function namedStub(work: Work, description: Description, name: string): StubbedDefinition | undefined {
  if (Object.hasOwn(description.screens, name)) return stubOf(description, name)
  // A member that the engine gives beside a definition - `working` of an agent or of a flow - has a stub of its own.
  if (name.includes('.')) return stubOf(description, name)
  for (const file of work.files.values())
    if (file.sort === 'backend')
      for (const declared of file.seen?.declared ?? [])
        if (declared.name === name) return declaredStub(description, declared)
  return undefined
}

/** The text of a module that gives records under names: each is frozen at every depth, so that no screen changes what another reads. */
export function stubText(stubs: [string, object][], before = ''): string {
  const lines = stubs.map(([as, stub]) => `export const ${as} = frozen(${JSON.stringify(stub)});`)
  const frozen =
    'const frozen = (one) => { for (const inner of Object.values(one)) if (typeof inner === "object" && inner !== null) frozen(inner); return Object.freeze(one); };'
  return `${before}${stubs.length ? `${frozen}\n` : ''}${lines.join('\n')}\n`
}

/** Every definition that the stored records of a view name: by an entry of `data`, and by what it calls. */
function namedIn(stored: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(stored)) for (const one of stored) namedIn(one, found)
  else if (isStored(stored)) {
    for (const kind of ['function', 'flow', 'agent', 'screen', 'query', 'action']) {
      const name = stored[kind]
      if (typeof name !== 'string') continue
      found.add(name.split('.')[0])
      // A member that the engine gives beside a definition has a stub of its own, which says that it is live.
      if (name.includes('.')) found.add(name)
    }
    for (const one of Object.values(stored)) namedIn(one, found)
  }
  return found
}

/** What a screen holds of each definition that its stored `data` names: a query that is live is watched there. */
export function stubsOf(work: Work, description: Description, records: unknown[]): Record<string, unknown> {
  const stubs: Record<string, unknown> = {}
  for (const name of [...namedIn(records)].sort()) {
    const stub = namedStub(work, description, name)
    if (stub) stubs[name] = stub
  }
  return stubs
}
