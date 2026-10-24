// Work that must all be done, as what follows a commit: each piece apart, so one that throws holds back no other.

/**
 * Takes pieces of work that must each be done whatever another does, and carries out every one of them in order.
 * Throws, once all have run, what the first that failed threw: whoever failed is not hidden.
 */
export function eachApart(pieces: (() => void)[]): void {
  let failed: { error: unknown } | undefined
  for (const piece of pieces)
    try {
      piece()
    } catch (error) {
      failed ??= { error }
    }
  if (failed) throw failed.error
}
