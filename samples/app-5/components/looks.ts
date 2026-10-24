import type { BotColour } from '../lib/looks'

// The colours a bot may wear, as the faces and the swatches draw them.
export const COLOURS: Record<BotColour, string> = {
  white: '#ffffff',
  brown: '#a16b39',
  red: '#fc2c3e',
  orange: '#f9670e',
  amber: '#f69412',
  green: '#14c370',
  teal: '#13b8a3',
  blue: '#1884fc',
  violet: '#905afb',
  pink: '#fb3499',
  grey: '#777777',
}

/** The colour of a bot by its name, and white for one that is not known. */
export function colourOf(name: string | undefined): string {
  const found = Object.entries(COLOURS).find(([one]) => one === name)
  return found ? found[1] : COLOURS.white
}
