/**
 * The measures of the speed real visitors see, each with the range its value can have and the line of good for it:
 * Google's line for the four of the web, and for a move between screens the same second as a load is held to.
 */
export const measures: Record<string, { most: number; good: number }> = {
  // The time to the largest content, in milliseconds.
  lcp: { most: 120_000, good: 2500 },
  // The delay of a press, from it to the next paint, in milliseconds.
  inp: { most: 60_000, good: 200 },
  // The shift of the layout, a sum of shares of the window.
  cls: { most: 10, good: 0.1 },
  // The time to the first byte of the document, in milliseconds.
  ttfb: { most: 120_000, good: 800 },
  // The time of a move between screens, from the press to the new screen drawn, in milliseconds.
  move: { most: 120_000, good: 1000 },
}

/** The kind of device a window of that width is: a phone, a tablet, or a desktop. */
export const deviceOf = (width: number): string => (width < 640 ? 'phone' : width < 1024 ? 'tablet' : 'desktop')
