import type { Description, StateEntry } from '../core/internal.ts'
import { stateEntries, isStored } from '../core/internal.ts'
import type { Written } from './rule.ts'

/** What the description stores of the screen or the component that a definition writes. */
export function viewOf(description: Description, written: Written): Record<string, unknown> {
  const stored: unknown =
    written.word === 'screen' ? description.screens[written.name] : description.components[written.name]
  return isStored(stored) ? stored : {}
}

/** The states that a view may name: its own, and those of the project. */
export function statesOf(description: Description, written: Written): Record<string, StateEntry> {
  return { ...stateEntries(description.project.state), ...stateEntries(viewOf(description, written).state) }
}
