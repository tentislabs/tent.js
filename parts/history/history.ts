import type { Change } from './compare/change.ts'
import type { Clash, Kind, Point, Writer } from './point.ts'
import type { Recording } from './record.ts'
import type { TurnRow } from './turns.ts'

/** The history of a project: a chain of full snapshots of its files, in one file that one program writes. Every member answers at once. */
export interface History {
  /** Records the files of a project as they are, as one point, and moves `now` to it. */
  record(project: string, o: Recording): Point
  /** Writes what this computer found of a point that exists: none of the three is part of its id. Throws T9107 for a point that is not there. */
  mark(point: string, o: Pick<Recording, 'checked' | 'description' | 'note'>): void
  /** The point of an id, and the bytes of a fingerprint. Nothing where the history holds none. */
  read(point: string): Point | undefined
  blob(fingerprint: string): Uint8Array | undefined
  /** The point that a word names: `now`, a pointer, a name, or the first 8 or more characters of an id, tried in that order. */
  find(word: string): Point | undefined
  /** The points along the first parents, newest first. */
  list(o?: { pointer?: string; kinds?: Kind[]; newest?: number }): Point[]
  /** What a pointer holds; a pointer set, which throws T9107 for a point that is not there; and every pointer. */
  pointer(name: string): string | undefined
  move(name: string, to: string): void
  pointers(): Record<string, string>
  /** The changes from one point to another, in the terms of the app. Throws T9107 for a point that is not there or was dropped. */
  compare(a: string, b: string): Change[]
  /** What a point changed against its first parent, as it was kept when it was recorded; nothing where none is kept. */
  changesOf(point: string): Change[] | undefined
  /** What each point changed from one point to another along the first parents of the later, oldest first; nothing where it was not kept. */
  changesBetween(from: string, to: string): Change[][] | undefined
  /** The newest point that changed a definition, a column or a step of that name, from the row kept for it. */
  changedBy(name: string): string | undefined
  /** Records the present, writes the files of a point, and records a point of the kind `back`. Throws T9107 for a point that is not there or was dropped. */
  back(project: string, point: string, by: Writer): Point
  /** Makes a branch at a point, `now` where none is named. Throws T0002 for a name that cannot name one, or names one already. */
  branch(name: string, from?: string): void
  /** Records the present, writes the files of a branch, and follows it. Throws T9107 for a branch that is not there. */
  switch(project: string, name: string, by: Writer): Point
  /** Merges a point or a branch into the files of the project. With `dry` it answers what it would do, and changes nothing. */
  merge(
    project: string,
    from: string,
    by: Writer,
    o?: { dry?: boolean },
  ): { point?: Point; changes: Change[]; clashes: Clash[] }
  /** Records the settled point of a merge with clashes. Throws T9102 while `tent.clash.ts` or a `.theirs` file is there. */
  settle(project: string, by: Writer): Point
  /** Which of the named points and blobs are here. */
  have(o: { points: string[]; blobs: string[] }): { points: string[]; blobs: string[] }
  /** Stores blobs and points of another history, each fingerprint and each id checked: T9107 for one that does not fit. */
  take(o: { blobs?: Record<string, Uint8Array>; points?: Point[] }): void
  /** Writes the files of a point into a folder. Throws T9107 for a point that is not there or was dropped. */
  write(point: string, folder: string): void
  /** Drops the points that are older than they are kept, and the blobs that no point names any more. */
  tidy(now: number, o: { kept: number }): { points: number; blobs: number }
  /** Writes points as commits into a folder, with the `git` program of the computer. Throws T0013 where there is none. */
  exportGit(folder: string, o?: { kinds?: Kind[] }): { commits: number }
  /** Writes the row of a turn of an agent that builds, in the place of the one of its id. */
  turn(row: TurnRow): void
  /** The turns, newest first: the newest `newest`, and with `unfinished` those still at work. Each with its changes. */
  turns(o?: { newest?: number; unfinished?: boolean }): TurnRow[]
  close(): void
}
