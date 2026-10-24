import { join } from 'node:path'
import { TentError } from '../core/index.ts'
import type { App } from '../engine/index.ts'

/** A mark: the data of a test app as it was when the mark was taken. A test hands it back to `app.back`. */
export interface Mark {
  readonly file: string
}

/**
 * Takes an app, and a folder that belongs to the test app. Answers `mark`, which writes a snapshot of the data
 * file into that folder, and `back`, which puts the snapshot of a mark back under the running app.
 */
export function marks(app: App, folder: string): { mark(): Promise<Mark>; back(mark: Mark): Promise<void> } {
  let taken = 0
  return {
    async mark() {
      const file = join(folder, `${++taken}.db`)
      await app.snapshot(file)
      return { file }
    },
    async back(mark) {
      const file: unknown = Reflect.get(Object(mark), 'file')
      if (typeof file !== 'string')
        throw new TentError('T0013', '`app.back` takes a mark, as `app.mark` answers one.', {
          fix: 'Take a mark with `await app.mark()`, and hand it back.',
        })
      await app.restore(file)
    },
  }
}
