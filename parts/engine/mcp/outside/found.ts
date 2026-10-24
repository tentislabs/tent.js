import type { Opened } from '../../opened.ts'

/** What the engine last found of the tools of one server: those it holds back, and when it looked. */
export interface Looked {
  held: Set<string>
  at: number
}

// What each app found of its servers, by the version, the service and the user whose connection was used.
const found = new WeakMap<Opened, Map<string, Looked>>()

/** What an app found of its servers, made at the first look. */
export function foundOf(o: Opened): Map<string, Looked> {
  const kept = found.get(o) ?? new Map<string, Looked>()
  found.set(o, kept)
  return kept
}

/** Whether a tool of a server is held back, by what the last look found, for any user's connection. */
export function isHeld(o: Opened, service: string, tool: string): boolean {
  for (const [key, one] of found.get(o) ?? [])
    if (key.startsWith(`${o.version} ${service} `) && one.held.has(tool)) return true
  return false
}

/** The tools of the outside servers that are held back now, by their dotted names. */
export function heldTools(o: Opened): string[] {
  const names = new Set<string>()
  for (const [key, one] of found.get(o) ?? []) {
    const [version, service] = key.split(' ')
    if (version === o.version) for (const tool of one.held) names.add(`${service}.${tool}`)
  }
  return [...names].sort()
}
