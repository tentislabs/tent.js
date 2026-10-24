import type { Opened } from '../opened.ts'

/**
 * Takes what the engine holds of an app and what a screen states as `framedBy`. Answers the sites that may show
 * the screen in a frame: those the screen names together with those the program gave for the whole app, `'anyone'`
 * where either says so, and nothing where neither names one.
 */
export function framedOf(o: Opened, screen: unknown): string[] | 'anyone' | null {
  const app = o.framedBy
  if (screen === 'anyone' || app === 'anyone') return 'anyone'
  const named = [...(Array.isArray(screen) ? screen.map(String) : []), ...(app ?? [])]
  return named.length ? [...new Set(named)] : null
}
