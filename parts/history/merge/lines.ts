// Past this many edits two texts are taken as wholly apart, which bounds the time of a merge.
const farthest = 4000

/**
 * The lines that two lists hold in common, in order, as pairs of their places: the longest such run that the
 * shortest walk of edits from one to the other leaves, as Myers found it, walked in linear space.
 */
function matched(a: string[], b: string[]): [number, number][] {
  const pairs: [number, number][] = []
  matchedIn((x, y) => a[x] === b[y], 0, a.length, 0, b.length, pairs, farthest)
  return pairs
}

/**
 * Adds to `pairs`, in order, the matched places of `n` lines from `x0` and `m` lines from `y0`: the lines that are
 * the same at the start and at the end first, and the middle split where the walks from both ends meet, each half
 * matched alone. Past `edits` the middle is taken as wholly apart.
 */
function matchedIn(
  same: (x: number, y: number) => boolean,
  x0: number,
  n: number,
  y0: number,
  m: number,
  pairs: [number, number][],
  edits: number,
): void {
  let start = 0
  while (start < n && start < m && same(x0 + start, y0 + start)) {
    pairs.push([x0 + start, y0 + start])
    start++
  }
  let end = 0
  while (end < n - start && end < m - start && same(x0 + n - 1 - end, y0 + m - 1 - end)) end++
  const [x, y, w, h] = [x0 + start, y0 + start, n - start - end, m - start - end]
  const split = w && h ? meeting(same, x, w, y, h, edits) : undefined
  if (split) {
    matchedIn(same, x, split.x, y, split.y, pairs, split.d)
    matchedIn(same, x + split.x, w - split.x, y + split.y, h - split.y, pairs, split.d)
  }
  for (let k = end; k > 0; k--) pairs.push([x0 + n - k, y0 + m - k])
}

/**
 * Walks the shortest edit of `n` lines from `x0` into `m` lines from `y0` from both ends at once, each walk keeping
 * one row, until they meet: answers the place where they met, counted from the start of the two, and how many
 * edits each half holds at most. Nothing where they would meet past `edits`.
 */
function meeting(
  same: (x: number, y: number) => boolean,
  x0: number,
  n: number,
  y0: number,
  m: number,
  edits: number,
): { x: number; y: number; d: number } | undefined {
  const most = Math.ceil((n + m) / 2)
  const off = most
  const size = 2 * most + 2
  const forth = new Int32Array(size).fill(-1)
  const back = new Int32Array(size).fill(-1)
  forth[off + 1] = 0
  back[off + 1] = 0
  const delta = n - m
  // Where the two lists differ in length by an odd number the walk forth meets the walk back, and else the other way.
  const odd = delta % 2 !== 0
  let [forthStart, forthEnd, backStart, backEnd] = [0, 0, 0, 0]
  for (let d = 0; d < Math.min(most, Math.ceil(edits / 2) + 1); d++) {
    for (let k = -d + forthStart; k <= d - forthEnd; k += 2) {
      const at = off + k
      let x = k === -d || (k !== d && forth[at - 1] < forth[at + 1]) ? forth[at + 1] : forth[at - 1] + 1
      let y = x - k
      while (x < n && y < m && same(x0 + x, y0 + y)) {
        x++
        y++
      }
      forth[at] = x
      if (x > n) forthEnd += 2
      else if (y > m) forthStart += 2
      else if (odd) {
        const mirror = off + delta - k
        if (mirror >= 0 && mirror < size && back[mirror] !== -1 && x >= n - back[mirror]) return { x, y, d: 2 * d }
      }
    }
    for (let k = -d + backStart; k <= d - backEnd; k += 2) {
      const at = off + k
      let x = k === -d || (k !== d && back[at - 1] < back[at + 1]) ? back[at + 1] : back[at - 1] + 1
      let y = x - k
      while (x < n && y < m && same(x0 + n - x - 1, y0 + m - y - 1)) {
        x++
        y++
      }
      back[at] = x
      if (x > n) backEnd += 2
      else if (y > m) backStart += 2
      else if (!odd) {
        const mirror = off + delta - k
        if (mirror >= 0 && mirror < size && forth[mirror] !== -1 && forth[mirror] >= n - x)
          return { x: forth[mirror], y: off + forth[mirror] - mirror, d: 2 * d + 1 }
      }
    }
  }
  return undefined
}

/** One place of a merge of lines where both sides changed the same lines, with the lines of each side. */
export interface LinesApart {
  // The first line of ours that the place holds, counted from 1, and how many lines of ours it holds.
  line: number
  count: number
  // Where in the merged lines the lines of ours that the place holds begin.
  at: number
  ours: string[]
  theirs: string[]
  base: string[]
}

const sameLines = (a: string[], b: string[]): boolean => a.length === b.length && a.every((one, k) => one === b[k])

/**
 * Merges two texts that came from one, as lists of lines: each run of lines that only one side changed is taken
 * from it, a run that both changed alike once, and a run that both changed to different lines is a clash, where
 * ours is kept. Answers the merged lines and each clash.
 */
export function mergeLines(base: string[], ours: string[], theirs: string[]): { lines: string[]; apart: LinesApart[] } {
  const toOurs = new Map(matched(base, ours))
  const toTheirs = new Map(matched(base, theirs))
  const lines: string[] = []
  const apart: LinesApart[] = []
  let [i, io, it] = [0, 0, 0]
  for (;;) {
    let j = i
    while (j < base.length && !(toOurs.has(j) && toTheirs.has(j))) j++
    const done = j >= base.length
    const [jo, jt] = done ? [ours.length, theirs.length] : [toOurs.get(j) ?? 0, toTheirs.get(j) ?? 0]
    const [was, mine, yours] = [base.slice(i, j), ours.slice(io, jo), theirs.slice(it, jt)]
    if (sameLines(mine, was) || sameLines(mine, yours)) lines.push(...(sameLines(mine, was) ? yours : mine))
    else if (sameLines(yours, was)) lines.push(...mine)
    else {
      apart.push({ line: io + 1, count: mine.length, at: lines.length, ours: mine, theirs: yours, base: was })
      lines.push(...mine)
    }
    if (done) break
    lines.push(base[j])
    ;[i, io, it] = [j + 1, jo + 1, jt + 1]
  }
  return { lines, apart }
}

/** A text as its lines, with one line ending. */
export const linesOf = (text: string): string[] => text.replace(/\r\n/g, '\n').split('\n')

/** The line ending that a text holds: that of Windows where it holds one, and else a line feed. */
export const endOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n')
