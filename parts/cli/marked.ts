// What stands in front of the name of a test, on a line of its own, in what a test file writes out: the line says
// that what follows was written by that test. It starts with a character that no text of a person holds.
export const testMark = '\u0000tent test: '

/**
 * Takes everything that one test file wrote out on one side, the name of a test, and which test of that name it
 * is, counted from 0. Answers what that test wrote: what stands between its mark and the next one. Nothing for a
 * test that has no mark, as one inside another test.
 */
export function wroteBy(written: string, name: string, nth: number): string {
  const parts = written.split(testMark)
  let met = 0
  for (const part of parts.slice(1)) {
    const end = part.indexOf('\n')
    const marked = end < 0 ? part : part.slice(0, end)
    if (marked !== name) continue
    if (met++ === nth) return end < 0 ? '' : part.slice(end + 1)
  }
  return ''
}

/** Takes everything that a test file wrote out. Answers it without the marks, as the file wrote it. */
export const unmarked = (written: string): string =>
  written
    .split(testMark)
    .map((part, i) => (i === 0 ? part : part.slice(part.indexOf('\n') + 1 || part.length)))
    .join('')
