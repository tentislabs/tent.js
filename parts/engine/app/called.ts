import { TentError } from '../../core/index.ts'
import type { App } from '../app.ts'
import { calledFacts } from '../called.ts'
import type { Opened } from '../opened.ts'

/**
 * `app.called`: in the mode `test` alone, carries a piece of work out, as a call of the test, and answers what it
 * answered or threw with what it did with the data: each table it read with its rows, each row it wrote as it was
 * before and after, and its trace. A trace holds no value of a row, and the data of a test app is gone at its close,
 * so a test is told them here. Throws T0013 in any other mode.
 */
export const member =
  (o: Opened): App['called'] =>
  (work) => {
    if (o.mode !== 'test')
      throw new TentError('T0013', '`app.called` tells the facts of a call in the mode `test` alone.', {
        fix: 'Open the app with `testApp()`.',
      })
    return calledFacts(work)
  }
