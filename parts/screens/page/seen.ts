/** Reads the write that an answer names, `<the number of the epoch>.<the number of the write>`, or nothing for another text. */
function read(at: string | null | undefined): [epoch: number, n: number] | undefined {
  const found = /^(\d{1,15})\.(\d{1,15})$/.exec(at ?? '')
  return found ? [Number(found[1]), Number(found[2])] : undefined
}

/**
 * Takes two writes that answers named. Answers the later one: that of the newer epoch, and in one epoch that of
 * the higher number. A page keeps it and names it in what it asks next, so that a machine which holds less does
 * not show the page an older state than it has seen.
 */
export function laterWrite(one: string | undefined, other: string | null | undefined): string | undefined {
  const [a, b] = [read(one), read(other)]
  if (!b) return a ? one : undefined
  if (!a) return other ?? undefined
  return b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]) ? (other ?? undefined) : one
}
