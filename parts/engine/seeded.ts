/**
 * Takes a seed, a text. Answers a source of numbers from 0 up to 1 drawn from it: the same seed draws the same
 * numbers on every computer. It names nothing outside itself, so that a page of a test is handed its text.
 */
export function seededSource(seed: string): () => number {
  // The seed is mixed into four words of 32 bits (cyrb128), which a small fast counter (sfc32) draws from.
  let [h1, h2, h3, h4] = [1779033703, 3144134277, 1013904242, 2773480762]
  for (let k = 0; k < seed.length; k++) {
    const code = seed.charCodeAt(k)
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  let [a, b, c, d] = [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0]
  return () => {
    const t = (((a + b) | 0) + d) | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (((c << 21) | (c >>> 11)) + t) | 0
    return (t >>> 0) / 4294967296
  }
}

/** So many bytes drawn from a source of numbers from 0 up to 1. */
export const bytesFrom = (random: () => number, count: number): Uint8Array =>
  Uint8Array.from({ length: count }, () => Math.floor(random() * 256))
