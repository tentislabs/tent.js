import { back } from './back.ts'
import { blobOf } from './blobs.ts'
import { branch, startOnMain } from './branches.ts'
import { changedBy, keepChanges, keptBetween, keptChanges } from './changed.ts'
import { compare, comparedAnew } from './compare/compare.ts'
import { exportGit } from './exportGit.ts'
import { find, found, list } from './find.ts'
import type { History } from './history.ts'
import { openKept } from './kept.ts'
import { filesOf, writeInto } from './lay.ts'
import { allPointers, pointerOf, setPointer } from './pointers.ts'
import { merge } from './merge/merge.ts'
import { keepDescription, record } from './record.ts'
import { readPoint } from './rows.ts'
import { settle } from './settle.ts'
import { switchTo } from './switch.ts'
import { have, take } from './sync.ts'
import { tidy } from './tidy.ts'
import { keepTurn, turnsOf } from './turns.ts'

/**
 * Takes a folder: the engine's own folder of a project. Opens `history.db` there, which is made where it is not
 * there, and answers the history. One program writes it, and whoever opened it closes it.
 */
export function openHistory(folder: string): History {
  const file = openKept(folder)
  return {
    record: (project, o) => record(file, project, o),
    mark(point, o) {
      file.write(() => {
        const { id } = found(file, point)
        if (o.checked !== undefined) file.run('UPDATE points SET checked = ? WHERE id = ?', [o.checked, id])
        if (o.note !== undefined) file.run('UPDATE points SET note = ? WHERE id = ?', [o.note, id])
        if (o.description) {
          file.run('UPDATE points SET description = ? WHERE id = ?', [keepDescription(file, o.description), id])
          // With its description a point says what it changed in the terms of the app.
          keepChanges(file, id, (a, b) => comparedAnew(file, a, b))
        }
      })
    },
    read: (point) => readPoint(file, point),
    blob: (fingerprint) => blobOf(file, fingerprint),
    find: (word) => find(file, word),
    list: (o) => list(file, o),
    pointer: (name) => pointerOf(file, name),
    move(name, to) {
      // `on` holds the name of the branch that `now` follows, and every other pointer a point.
      setPointer(file, name, name === 'on' ? to : found(file, to).id)
    },
    pointers: () => allPointers(file),
    compare: (a, b) => compare(file, a, b),
    changesOf(point) {
      const parent = readPoint(file, point)?.parents[0]
      return parent === undefined ? undefined : keptChanges(file, point, parent)
    },
    changesBetween: (from, to) => keptBetween(file, from, to),
    changedBy: (name) => changedBy(file, name),
    back: (project, point, by) => back(file, project, point, by),
    // A history follows `main` from the first time it knows of a branch.
    branch(name, from) {
      startOnMain(file)
      branch(file, name, from)
    },
    switch(project, name, by) {
      startOnMain(file)
      return switchTo(file, project, name, by)
    },
    merge(project, from, by, o) {
      startOnMain(file)
      return merge(file, project, from, by, o)
    },
    settle: (project, by) => settle(file, project, by),
    have: (o) => have(file, o),
    take: (o) => take(file, o),
    write(point, folder) {
      const named = found(file, point)
      filesOf(file, named)
      writeInto(file, named, folder)
    },
    tidy: (now, o) => tidy(file, now, o),
    exportGit: (folder, o) => exportGit(file, folder, o),
    turn: (row) => keepTurn(file, row),
    turns: (o = {}) => turnsOf(file, o, (a, b) => compare(file, a, b)),
    close: () => file.close(),
  }
}
