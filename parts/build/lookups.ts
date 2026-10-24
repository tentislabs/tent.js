import type { Scan } from './read/scan.ts'
import { scanOf } from './read/scan.ts'
import type { Node } from './tree.ts'

// What a build asks the disk of a path - whether a file is there, and where it really lies - is asked again and
// again by its steps, and on some systems each asking is slow; and the tree of a text that did not change is the
// same tree. So it is kept: for one build, and through a session of development, where the watcher of the folder
// says when a file comes or goes. What a step made of a file or a view is kept here too, by a key of the step's
// own, so that a save makes again only what it reached.

/** What is kept of the paths: whether each is a file, the real place of each, and the tree read of a text. */
interface Kept {
  files: Map<string, boolean>
  places: Map<string, string>
  trees: Map<string, { text: string; tree: Node }>
  // The fingerprint of what every file reaches, as the last build found it: where it changed, nothing is kept.
  whole?: string
}

const anew = (): Kept => ({ files: new Map(), places: new Map(), trees: new Map() })

let kept = anew()
let session: Kept | undefined
let inSession = false

/** What one step keeps, by a key of its own: anew for each build, or through a session of development. */
export interface Keeping<T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
}

// Every keeping of the steps, each started with a build and emptied with the session.
const keepings: { begin(): void; empty(): void }[] = []

/** Makes what one step keeps, by a key of its own, for one build or through a session of development. */
export function keeping<T>(): Keeping<T> {
  let ofSession = new Map<string, T>()
  // A step is loaded while the first build of a session runs: what it keeps from then on is the session's.
  let held = inSession ? ofSession : new Map<string, T>()
  keepings.push({
    begin: () => {
      held = inSession ? ofSession : new Map()
    },
    empty: () => {
      ofSession = new Map()
      held = inSession ? ofSession : new Map()
    },
  })
  return { get: (key) => held.get(key), set: (key, value) => void held.set(key, value) }
}

/** Whether the build that runs is one of a session of development, which keeps what it made for the next. */
export const ofSession = (): boolean => inSession

/** Starts what a build keeps: anew, or what the session of development keeps, for a build of that session. */
export function lookupsFor(ofSession: boolean): void {
  inSession = ofSession
  if (!ofSession) kept = anew()
  else {
    session ??= anew()
    kept = session
  }
  for (const one of keepings) one.begin()
}

/** Forgets what the session kept of the paths: a file or a folder came or went. */
export function lookupsForgotten(): void {
  session?.files.clear()
  session?.places.clear()
}

/**
 * Takes the fingerprint of what every file of the project reaches. Where it is not the one the last build of the
 * session found, the session keeps nothing from then on, and the build makes everything anew: what it asked the
 * disk, and what each step made. A tree is kept by its text alone, which reads to one tree whatever changed.
 */
export function keptWhole(print: string): void {
  if (kept.whole === print) return
  const held = kept.whole
  kept.whole = print
  if (held === undefined) return
  kept.files.clear()
  kept.places.clear()
  for (const one of keepings) one.empty()
}

/** The fingerprint of what every file reaches, as the build that runs found it. */
export const wholeKept = (): string => kept.whole ?? ''

// What each tree holds, read once: a text that did not change is the same tree, through a session of development.
const scans = new WeakMap<Node, Scan>()

/** What a tree holds, as `scanOf` reads it, read once for each tree, by the build and by the rules of the check. */
export function scanned(tree: Node): Scan {
  const held = scans.get(tree) ?? scanOf(tree)
  scans.set(tree, held)
  return held
}

/** The tree of a source file's text, read once for as long as the text stays the same. */
export function lookedTree(path: string, text: string, read: () => Node): Node {
  const held = kept.trees.get(path)
  if (held?.text === text) return held.tree
  const tree = read()
  kept.trees.set(path, { text, tree })
  return tree
}

/** Whether a path names a file, asked once while it is kept. */
export function lookedFile(path: string, ask: (path: string) => boolean): boolean {
  const held = kept.files.get(path)
  if (held !== undefined) return held
  const answer = ask(path)
  kept.files.set(path, answer)
  return answer
}

/** The real place of a path, asked once while it is kept. */
export function lookedPlace(kind: string, path: string, ask: (path: string) => string): string {
  const key = `${kind}\n${path}`
  const held = kept.places.get(key)
  if (held !== undefined) return held
  const answer = ask(path)
  kept.places.set(key, answer)
  return answer
}
