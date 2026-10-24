import type { FileName } from './fileName.ts'
import type { Files } from './files.ts'
import { insideOf } from './filesInside.ts'
import type { Store } from './store.ts'

/**
 * Takes the files of an app and what reads one file. Visits every tenant's file that stands on the disk, one
 * after another, to read alone: a file that is closed is opened by a store of its own that is told to write
 * nothing, and closed again. Between two files it lets whatever else waits in the program run. Answers a promise
 * of what each visit answered, in the order of the visits.
 */
export async function visitFiles<T>(files: Files, visit: (store: Store, file: FileName) => T): Promise<T[]> {
  const inside = insideOf(files)
  const answers: T[] = []
  for (const file of files.walk()) {
    answers.push(inside.alone(file, (store) => visit(store, file)))
    await new Promise((resolve) => setImmediate(resolve))
  }
  return answers
}
