// What only the part drawn on the server alone imports: no browser file may hold it.
export const shoutMarker = 'The marker of the shouting helper'

/** A text written loud, as a large library of the server would write it. */
export function shout(said: string): string {
  return `${said.toUpperCase()}! (${shoutMarker})`
}
