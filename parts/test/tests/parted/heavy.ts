// What only a part drawn on the server alone imports: no browser file may hold it.
export const heavyMarker = 'The marker of the heavy helper'

/** A text written loud, as a large library of the server would write it. */
export function loud(said: string): string {
  return `${said.toUpperCase()}! (${heavyMarker})`
}
