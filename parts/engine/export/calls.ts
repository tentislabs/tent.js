import type { Description } from '../../core/internal.ts'

/**
 * Takes a description and the name of a screen. Answers the functions that the screen calls, or a component it
 * draws: the changes and the actions that their files name, as the build read them from the source.
 */
export function screenCalls(description: Description, screen: string): string[] {
  const found = new Set<string>()
  const uses = Object(description.screens[screen]).uses
  const views = [description.screens[screen]]
  for (const name of Array.isArray(uses) ? uses : []) views.push(description.components[String(name)])
  for (const view of views) {
    const calls: unknown = Object(view).calls
    for (const one of Array.isArray(calls) ? calls : []) found.add(String(one))
  }
  return [...found].sort()
}
