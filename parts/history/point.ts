/** Who made a point. */
export interface Writer {
  kind: 'person' | 'ai' | 'tool' | 'server'
  id?: string
}

/** What made a point. */
export type Kind = 'save' | 'command' | 'named' | 'published' | 'back' | 'merge' | 'turn'

/** One place where the two sides of a merge both changed a thing. */
export interface Clash {
  what: string
  name: string
  path?: (string | number)[]
  ours: unknown
  theirs: unknown
  base: unknown
}

/**
 * One point of the history: a full snapshot of the files of a project. `files` holds each file by its path, with
 * its fingerprint, and a point that was dropped has none. `description` is the fingerprint of the description that
 * was kept with a point that built.
 */
export interface Point {
  id: string
  parents: string[]
  at: number
  by: Writer
  kind: Kind
  name?: string
  checked?: boolean
  unsettled?: true
  description?: string
  files?: Record<string, string>
  note?: string
  clashes?: Clash[]
}
