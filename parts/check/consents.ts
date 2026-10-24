import type { Node, Source } from '../build/index.ts'
import { keyOf, kid, walk } from '../build/index.ts'
import type { Description, StateEntry } from '../core/internal.ts'
import { stateEntries, isStored } from '../core/internal.ts'
import type { Written } from './rule.ts'
import { writtenIn } from './rule.ts'
import { statedAt } from './stated.ts'

/** One `consent` of a `script` line of a `head`: the definition that writes it, the states it may name, and where it stands. */
export interface Consent {
  written: Written
  consent: string
  states: Record<string, StateEntry>
  node: Node | undefined
}

/** The `consent` of each `script` line of a stored `head`. */
const consentsOf = (head: unknown): string[] =>
  (Array.isArray(head) ? head : []).flatMap((line) =>
    isStored(line) && isStored(line.script) && typeof line.script.consent === 'string' ? [line.script.consent] : [],
  )

/** Where a definition writes a `consent` of that text in its `head`, or nothing where it is not written in place. */
function nodeOf(written: Written, consent: string): Node | undefined {
  const head = statedAt(written, ['head'])
  let found: Node | undefined
  if (head)
    walk(head, (node) => {
      const value = node.type === 'Property' && keyOf(node) === 'consent' ? kid(node, 'value') : undefined
      if (!found && value?.type === 'Literal' && value.value === consent) found = node
    })
  return found
}

/**
 * Takes the description and the files of a project. Answers every `consent` of a script of the head: those of the
 * project, which name a state of the project, and those of each screen, which name its own or the project's.
 */
export function consentsIn(description: Description, source: Source): Consent[] {
  const project = stateEntries(description.project.state)
  return writtenIn(source).flatMap((written) => {
    const stored: unknown =
      written.word === 'screen'
        ? description.screens[written.name]
        : written.word === 'project'
          ? description.project
          : undefined
    if (!isStored(stored)) return []
    const states = written.word === 'screen' ? { ...project, ...stateEntries(stored.state) } : project
    return consentsOf(stored.head).map((consent) => ({ written, consent, states, node: nodeOf(written, consent) }))
  })
}
