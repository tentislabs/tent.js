import type { SqliteFile } from '../data/index.ts'
import { found } from './find.ts'
import { heldFiles, rulesOf } from './held.ts'
import { filesOf, holdBack, lay } from './lay.ts'
import type { Point, Writer } from './point.ts'
import { lastBuilt, record, stand } from './record.ts'

/**
 * Takes the folder of a project, a word that names a point, and who goes back. Records the present as a point,
 * writes the files of the named point, and records a point of the kind `back` whose parent is the present: so
 * going back can itself be undone, and nothing of the history is cut off. Answers the `back` point. Throws T9107
 * for a point that is not there or that was dropped, and T0013 where a file of the named point would be written
 * over one that no point holds or through a link, before anything is recorded or written.
 */
export function back(file: SqliteFile, project: string, word: string, by: Writer): Point {
  const old = found(file, word)
  const files = filesOf(file, old)
  const rules = rulesOf(lastBuilt(file))
  holdBack(project, rules.roots, heldFiles(project, rules).files, files)
  const present = record(file, project, { by, kind: 'command' })
  lay(file, project, rules.roots, present.files ?? {}, files)
  return file.write(() =>
    stand(file, {
      parents: [present.id],
      at: Date.now(),
      by: { kind: by.kind, ...(by.id !== undefined ? { id: by.id } : {}) },
      kind: 'back',
      ...(old.description !== undefined ? { description: old.description } : {}),
      files,
    }),
  )
}
